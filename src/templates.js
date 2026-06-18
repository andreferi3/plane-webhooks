export function formatTaskMessage(task) {
  return [
    '[PM] New Task',
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Priority: ${task.priority || 'Normal'}`,
    `Due: ${task.due || '-'}`,
    `Assignee: ${task.assignee || '-'}`,
    `Plane URL: ${task.url || '-'}`,
    'Description:',
    task.description || '-',
    '',
    '@PengawalBayanganBot please review this task and provide your approval or rejection.',
  ].join('\n');
}

export function formatOwnerApproval(taskId) {
  return `[OWNER] APPROVED ${taskId}`;
}

export function formatOwnerRejection(taskId, reason) {
  return [`[OWNER] REJECTED ${taskId}`, `Reason: ${reason}`].join('\n');
}
