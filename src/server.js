import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { sendTelegram } from './bot.js';
import { classifyTask } from './triage.js';
import { formatTaskMessage, formatHermesReply, formatOwnerApproval } from './templates.js';
import { getTask, upsertTask } from './store.js';

const DEFAULT_DELIVERY_CACHE_LIMIT = 1000;

export function verifyPlaneSignature(rawPayload, signature, secret) {
  if (!rawPayload || !signature || !secret) return false;

  const normalizedSignature = signature.replace(/^sha256=/i, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(normalizedSignature)) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawPayload)
    .digest('hex');

  const receivedBuffer = Buffer.from(normalizedSignature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function pickIssue(payload) {
  return payload?.issue || payload?.data?.issue || payload?.data || payload || {};
}

function getAssignees(issue) {
  return issue?.assignees || issue?.assignee || issue?.assignees_data || [];
}

function matchesAssignee(issue, targetUser) {
  if (!targetUser) return true;
  const assignees = getAssignees(issue);
  const list = Array.isArray(assignees) ? assignees : [assignees];

  return list.some((a) => {
    if (!a) return false;
    const email = String(a.email || a.user_email || a?.user?.email || '').toLowerCase();
    const name = String(a.display_name || a.name || a?.user?.name || '').toLowerCase();
    return email === targetUser || name === targetUser;
  });
}

function rememberDelivery(seenDeliveries, deliveryId, limit) {
  if (!deliveryId) return false;
  if (seenDeliveries.has(deliveryId)) return true;

  seenDeliveries.set(deliveryId, Date.now());
  if (seenDeliveries.size > limit) {
    const oldestKey = seenDeliveries.keys().next().value;
    seenDeliveries.delete(oldestKey);
  }

  return false;
}

function pickAssignee(issue) {
  const assignees = getAssignees(issue);
  const list = Array.isArray(assignees) ? assignees : [assignees];
  const first = list.find(Boolean);
  return first?.email || first?.user_email || first?.user?.email || first?.display_name || first?.name || first?.user?.name || '-';
}

function buildTask(payload) {
  const issue = pickIssue(payload);
  return {
    id: issue.identifier || issue.sequence_id || issue.id || `task-${Date.now()}`,
    title: issue.name || issue.title || issue.subject || 'Untitled task',
    priority: issue.priority || 'Normal',
    due: issue.due_date || issue.due || '-',
    assignee: pickAssignee(issue),
    url: issue.url || issue.web_url || issue.html_url || payload?.url || '-',
    description: issue.description || issue.description_text || '-',
  };
}

async function processPlaneWebhook(payload, context, deps) {
  const task = buildTask(payload);
  const { taskStore, telegramSender, env } = deps;

  await taskStore.upsertTask(task.id, {
    ...task,
    rawEvent: payload,
    deliveryId: context.deliveryId,
    event: context.event,
    status: 'TRIAGED',
  });
  await telegramSender(formatTaskMessage(task), env);

  const decision = classifyTask(task);
  await taskStore.upsertTask(task.id, { status: decision.state, decision });
  await telegramSender(formatHermesReply({
    state: decision.state,
    task,
    reason: decision.reason,
    need: decision.need,
  }), env);

  return { taskId: task.id, state: decision.state };
}

const defaultTaskStore = { getTask, upsertTask };

export function createApp({
  env = process.env,
  telegramSender = sendTelegram,
  taskStore = defaultTaskStore,
  logger = console,
} = {}) {
  const app = express();
  const seenDeliveries = new Map();
  const deliveryCacheLimit = Number(env.DELIVERY_CACHE_LIMIT || DEFAULT_DELIVERY_CACHE_LIMIT);
  const planeWebhookSecret = env.PLANE_WEBHOOK_SECRET;
  const targetUser = (env.PLANE_USER_EMAIL || '').toLowerCase();

  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/webhooks/plane', (req, res) => {
    if (!planeWebhookSecret) {
      return res.status(500).json({ ok: false, error: 'PLANE_WEBHOOK_SECRET is required' });
    }

    const signature = req.header('x-plane-signature');
    if (!verifyPlaneSignature(req.rawBody, signature, planeWebhookSecret)) {
      return res.status(403).json({ ok: false, error: 'invalid Plane signature' });
    }

    const deliveryId = req.header('x-plane-delivery') || '';
    const event = req.header('x-plane-event') || req.body?.event || '';
    if (rememberDelivery(seenDeliveries, deliveryId, deliveryCacheLimit)) {
      return res.json({ ok: true, duplicate: true, deliveryId });
    }

    const issue = pickIssue(req.body);
    if (!matchesAssignee(issue, targetUser)) {
      return res.json({ ok: true, ignored: 'not assigned to target user', deliveryId });
    }

    processPlaneWebhook(req.body, { deliveryId, event }, { env, telegramSender, taskStore })
      .catch((error) => logger.error('Plane webhook processing failed', { deliveryId, event, error }));

    return res.json({ ok: true, queued: true, deliveryId });
  });

  app.post('/owner/approve', async (req, res) => {
    try {
      const { taskId } = req.body || {};
      if (!taskId) return res.status(400).json({ ok: false, error: 'taskId required' });

      const task = await taskStore.getTask(taskId);
      if (!task) return res.status(404).json({ ok: false, error: 'task not found' });

      await taskStore.upsertTask(taskId, { status: 'APPROVED' });
      await telegramSender(formatOwnerApproval(taskId), env);

      return res.json({ ok: true });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.use((error, _req, res, _next) => {
    logger.error(error);
    return res.status(400).json({ ok: false, error: 'invalid JSON payload' });
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const PORT = process.env.PORT || 3000;
  createApp().listen(PORT, () => console.log(`listening on :${PORT}`));
}
