import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = process.env.STATE_FILE || path.resolve('data/state.json');

async function ensureDir() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
}

export async function loadState() {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { tasks: {} };
  }
}

export async function saveState(state) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(state, null, 2));
}

export async function upsertTask(taskId, patch) {
  const state = await loadState();
  state.tasks[taskId] = { ...(state.tasks[taskId] || {}), ...patch, updatedAt: new Date().toISOString() };
  await saveState(state);
  return state.tasks[taskId];
}

export async function getTask(taskId) {
  const state = await loadState();
  return state.tasks[taskId] || null;
}
