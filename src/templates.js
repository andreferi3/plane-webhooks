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
    '@PengawalBayanganBot Berikan persetujuan atau penolakan untuk tugas ini dan berikan action plan. Dan juga analisa ini untuk project path mana (DKI UF, DKI BO, DKI APDK, DKI MI, DKI APDK Partner).',
    '- DKI UF → /mnt/d/Project/DKI/customer-frontend',
    '- DKI BO → /mnt/d/Project/DKI/backoffice-frontend-v2',
    '- DKI APDK → /mnt/d/Project/DKI/backoffice-frontend-apdk',
    '- DKI MI → /mnt/d/Project/DKI/backoffice-frontend-mi',
    '- DKI APDK Partner → /mnt/d/Project/DKI/dashboard-frontend-apdk-partner',
    '',
    'Jika ada pertanyaan lebih lanjut, silakan hubungi @callmeowl.',
  ].join('\n');
}

export function formatOwnerApproval(taskId) {
  return `[OWNER] APPROVED ${taskId}`;
}

export function formatOwnerRejection(taskId, reason) {
  return [`[OWNER] REJECTED ${taskId}`, `Reason: ${reason}`].join('\n');
}
