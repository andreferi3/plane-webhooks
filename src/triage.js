export function classifyTask(task) {
  const text = [task.title, task.description, task.priority, task.assignee, task.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const blockedHints = ['missing', 'unknown', 'tbd', 'todo', 'need info', 'unclear', 'depends on'];
  const approvalHints = ['deploy', 'delete', 'payment', 'auth', 'permission', 'prod', 'production', 'security', 'high impact'];

  const hasBlocked = blockedHints.some((k) => text.includes(k));
  if (hasBlocked) {
    return {
      state: 'BLOCKED',
      reason: 'missing input or dependency',
      need: 'fill missing detail / dependency',
    };
  }

  const needsApproval = approvalHints.some((k) => text.includes(k)) || String(task.priority || '').toLowerCase() === 'high';
  if (needsApproval) {
    return {
      state: 'NEED APPROVAL',
      reason: 'task sensitive or high impact',
      need: 'owner approval from @callmeowl',
    };
  }

  return {
    state: 'READY',
    reason: 'scope clear, input enough, no blocker',
  };
}
