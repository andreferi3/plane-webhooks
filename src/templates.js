const HERMES_CLASSIFY_PROMPT = [
  'please classify this task @PengawalBayanganBot',
  '',
  'Instruction for @PengawalBayanganBot:',
  '- Reply with exactly one [HERMES] block. No prose before or after.',
  '- First line must be one of: [HERMES] READY, [HERMES] BLOCKED, [HERMES] NEED APPROVAL.',
  '- Use the Task ID from [PM] New Task below.',
  '- If priority is High/high, high impact, sensitive, auth, payment, security, deploy, delete, prod, or permission related, choose NEED APPROVAL.',
  '- If project/workspace is unclear, choose BLOCKED and ask which DKI project to scan.',
  '- If enough context and no approval needed, choose READY.',
  '- Final approver is only @callmeowl. Do not start work until [OWNER] APPROVED <Task ID> comes from @callmeowl.',
  '',
  'Required reply format:',
  '[HERMES] <READY|BLOCKED|NEED APPROVAL>',
  'Task ID: <task id>',
  'Reason: <short reason>',
  'Need: <needed action, or ->',
  'Action Plan:',
  '- <step 1>',
  '- <step 2>',
  '',
  'If project/workspace unclear, reply exactly like this shape:',
  '[HERMES] BLOCKED',
  'Task ID: <task id>',
  'Reason: need more detail',
  'Need: aku harus scan di project mana ? DKI UF, DKI BO, DKI APDK, DKI MI ? @callmeowl',
  '',
  'Known DKI project paths:',
  'DKI UF: /mnt/d/Project/DKI/customer-frontend',
  'DKI BO: /mnt/d/Project/DKI/backoffice-frontend-v2',
  'DKI APDK: /mnt/d/Project/DKI/backoffice-frontend-apdk',
  'DKI MI: /mnt/d/Project/DKI/backoffice-frontend-mi',
  'DKI APDK Partner: /mnt/d/Project/DKI/dashboard-frontend-apdk-partner',
  '',
  'Task to classify:',
];

export function formatTaskMessage(task) {
  return [
    ...HERMES_CLASSIFY_PROMPT,
    '[PM] New Task',
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Priority: ${task.priority || 'Normal'}`,
    `Due: ${task.due || '-'}`,
    `Assignee: ${task.assignee || '-'}`,
    `Plane URL: ${task.url || '-'}`,
    'Description:',
    task.description || '-',
  ].join('\n');
}

export function formatOwnerApproval(taskId) {
  return `[OWNER] APPROVED ${taskId}`;
}

export function formatOwnerRejection(taskId, reason) {
  return [`[OWNER] REJECTED ${taskId}`, `Reason: ${reason}`].join('\n');
}
