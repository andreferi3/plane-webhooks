export function formatTaskMessage(task) {
  return [
    '@PengawalBayanganBot please classify this task',
    '',
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
