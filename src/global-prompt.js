const buildIssueLines = (entry, limit = 6) => {
  const byIssue = new Map();
  for (const action of entry.actions) {
    const key = action.issueKey;
    if (!byIssue.has(key)) {
      byIssue.set(key, {
        key,
        summary: action.issueSummary,
        status: null,
      });
    }
    if (action.type === 'status-change' && action.details?.to) {
      const current = byIssue.get(key);
      current.status = action.details.to;
    }
  }
  return Array.from(byIssue.values())
    .slice(0, limit)
    .map((iss) => {
      const statusPart = iss.status ? ` (status: ${iss.status})` : '';
      return `- ${iss.key}: ${iss.summary || ''}${statusPart}`;
    })
    .join('\n');
};

export const buildGlobalPrompt = () => '';
