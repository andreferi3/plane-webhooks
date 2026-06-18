import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp, verifyPlaneSignature } from '../src/server.js';

const SECRET = 'plane-secret';

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function createMemoryStore() {
  const tasks = {};
  return {
    tasks,
    async upsertTask(taskId, patch) {
      tasks[taskId] = { ...(tasks[taskId] || {}), ...patch };
      return tasks[taskId];
    },
    async getTask(taskId) {
      return tasks[taskId] || null;
    },
  };
}

async function waitFor(check, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for async webhook processing');
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('verifyPlaneSignature accepts Plane HMAC signature', () => {
  const body = Buffer.from('{"event":"issue"}');

  assert.equal(verifyPlaneSignature(body, sign(body), SECRET), true);
  assert.equal(verifyPlaneSignature(body, `sha256=${sign(body)}`, SECRET), true);
  assert.equal(verifyPlaneSignature(body, sign(body, 'bad-secret'), SECRET), false);
  assert.equal(verifyPlaneSignature(body, 'not-a-hex-signature', SECRET), false);
});

test('POST /webhooks/plane rejects invalid signature', async () => {
  const messages = [];
  const store = createMemoryStore();
  const app = createApp({
    env: { PLANE_WEBHOOK_SECRET: SECRET },
    taskStore: store,
    telegramSender: (text) => {
      messages.push(text);
      return Promise.resolve();
    },
    logger: { error() {} },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhooks/plane`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-plane-signature': 'bad',
      },
      body: JSON.stringify({ event: 'issue', data: { id: 'ISS-1', name: 'Bad signature' } }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(messages, []);
    assert.deepEqual(store.tasks, {});
  });
});

test('POST /webhooks/plane queues valid delivery and deduplicates retry', async () => {
  const messages = [];
  const store = createMemoryStore();
  const app = createApp({
    env: { PLANE_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: 'chat' },
    taskStore: store,
    telegramSender: (text) => {
      messages.push(text);
      return Promise.resolve();
    },
    logger: { error() {} },
  });

  await withServer(app, async (baseUrl) => {
    const body = JSON.stringify({ event: 'issue', action: 'created', data: { id: 'ISS-1', name: 'Build receiver' } });
    const headers = {
      'content-type': 'application/json',
      'x-plane-signature': sign(body),
      'x-plane-delivery': 'delivery-1',
      'x-plane-event': 'issue',
    };

    const first = await fetch(`${baseUrl}/webhooks/plane`, { method: 'POST', headers, body });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).queued, true);

    await waitFor(() => messages.length === 1);
    assert.match(messages[0], /^please classify this task @PengawalBayanganBot\n\n/);
    assert.match(messages[0], /Reply with exactly one \[HERMES\] block/);
    assert.match(messages[0], /Final approver is only @callmeowl/);
    assert.match(messages[0], /Known DKI project paths:/);
    assert.match(messages[0], /\[PM\] New Task/);
    assert.match(messages[0], /Title: Build receiver/);
    assert.equal(store.tasks['ISS-1'].deliveryId, 'delivery-1');
    assert.equal(store.tasks['ISS-1'].status, 'NOTIFIED');

    const second = await fetch(`${baseUrl}/webhooks/plane`, { method: 'POST', headers, body });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).duplicate, true);
    assert.equal(messages.length, 1);
  });
});

test('POST /webhooks/plane deduplicates same task across different Plane deliveries', async () => {
  const messages = [];
  const store = createMemoryStore();
  const app = createApp({
    env: { PLANE_WEBHOOK_SECRET: SECRET, TASK_DEDUPE_WINDOW_MS: '60000' },
    taskStore: store,
    telegramSender: (text) => {
      messages.push(text);
      return Promise.resolve();
    },
    logger: { error() {} },
  });

  await withServer(app, async (baseUrl) => {
    const body = JSON.stringify({
      event: 'issue',
      action: 'created',
      data: {
        id: 'ISS-16',
        name: 'Frontend detail drawer and write actions',
        priority: 'high',
        assignees: [{ email: 'dodi.triwibowo@usenobi.com' }],
        description: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Need approval flow' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
          ],
        },
      },
    });

    const makeHeaders = (deliveryId) => ({
      'content-type': 'application/json',
      'x-plane-signature': sign(body),
      'x-plane-delivery': deliveryId,
      'x-plane-event': 'issue',
    });

    const first = await fetch(`${baseUrl}/webhooks/plane`, {
      method: 'POST',
      headers: makeHeaders('delivery-a'),
      body,
    });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).queued, true);

    await waitFor(() => messages.length === 1);
    assert.match(messages[0], /Need approval flow/);
    assert.match(messages[0], /Second line/);
    assert.doesNotMatch(messages[0], /\[object Object\]/);

    const second = await fetch(`${baseUrl}/webhooks/plane`, {
      method: 'POST',
      headers: makeHeaders('delivery-b'),
      body,
    });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), {
      ok: true,
      duplicate: true,
      deliveryId: 'delivery-b',
      taskId: 'ISS-16',
    });
    assert.equal(messages.length, 1);
  });
});

test('POST /webhooks/plane ignores deliveries for other assignees', async () => {
  const messages = [];
  const store = createMemoryStore();
  const app = createApp({
    env: { PLANE_WEBHOOK_SECRET: SECRET, PLANE_USER_EMAIL: 'me@example.com' },
    taskStore: store,
    telegramSender: (text) => {
      messages.push(text);
      return Promise.resolve();
    },
    logger: { error() {} },
  });

  await withServer(app, async (baseUrl) => {
    const body = JSON.stringify({
      event: 'issue',
      action: 'updated',
      data: { id: 'ISS-2', name: 'Other task', assignees: [{ email: 'other@example.com' }] },
    });

    const response = await fetch(`${baseUrl}/webhooks/plane`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-plane-signature': sign(body),
        'x-plane-delivery': 'delivery-2',
        'x-plane-event': 'issue',
      },
      body,
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ignored, 'not assigned to target user');
    assert.deepEqual(messages, []);
    assert.deepEqual(store.tasks, {});
  });
});

test('POST /webhooks/plane requires configured Plane secret', async () => {
  const app = createApp({ logger: { error() {} } });

  await withServer(app, async (baseUrl) => {
    const body = JSON.stringify({ event: 'issue' });
    const response = await fetch(`${baseUrl}/webhooks/plane`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-plane-signature': sign(body),
      },
      body,
    });

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'PLANE_WEBHOOK_SECRET is required');
  });
});
