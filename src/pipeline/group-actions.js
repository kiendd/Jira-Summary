export const groupActionsByActor = (actions) => {
  const map = new Map();
  const statusIssueKeys = new Map();
  for (const action of actions) {
    const key = action.actor?.id || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        actor: action.actor || { id: 'unknown', name: 'Unknown' },
        actions: [],
        stats: { created: 0, status: 0, comments: 0, worklogs: 0, worklogSeconds: 0 },
      });
    }
    const entry = map.get(key);
    entry.actions.push(action);
    if (action.type === 'created') entry.stats.created += 1;
    if (action.type === 'status-change' && action.issueKey) {
      if (!statusIssueKeys.has(key)) statusIssueKeys.set(key, new Set());
      statusIssueKeys.get(key).add(action.issueKey);
    }
    if (action.type === 'comment') entry.stats.comments += 1;
    if (action.type === 'worklog') {
      entry.stats.worklogs += 1;
      entry.stats.worklogSeconds += Number(action.details?.timeSpentSeconds || 0);
    }
  }

  const entries = Array.from(map.values()).sort((a, b) => b.actions.length - a.actions.length);
  entries.forEach((entry) => {
    const keys = statusIssueKeys.get(entry.actor?.id || 'unknown');
    entry.stats.status = keys ? keys.size : 0;
  });
  return entries;
};
