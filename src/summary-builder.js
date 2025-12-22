import { secondsToHhmm, truncate } from './utils.js';

const listIssues = (items, limit = 5) => {
  if (!items.length) return '';
  const shown = items.slice(0, limit).map((it) => `${it.key}${it.summary ? ` (${it.summary})` : ''}`);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest} nữa` : shown.join(', ');
};

export const buildLocalSummary = (actorBlock) => {
  const byIssue = new Map();

  const transitionGroups = new Map();
  const createdIssues = [];
  let commentCount = 0;
  let worklogCount = 0;
  let workSeconds = 0;

  for (const action of actorBlock.actions) {
    const key = action.issueKey;
    if (!byIssue.has(key)) {
      byIssue.set(key, {
        key,
        summary: action.issueSummary,
        created: false,
        transitions: [],
        comments: 0,
        worklogs: 0,
        workSeconds: 0,
      });
    }
    const entry = byIssue.get(key);
    if (!entry.description && action.issueDescription) {
      entry.description = truncate(action.issueDescription, 180);
    }
    if (action.type === 'created') {
      entry.created = true;
      createdIssues.push({ key: entry.key, summary: entry.summary });
    }
    if (action.type === 'status-change') {
      const from = action.details?.from || '—';
      const to = action.details?.to || '—';
      const label = `${from} -> ${to}`;
      if (!transitionGroups.has(label)) {
        transitionGroups.set(label, []);
      }
      const arr = transitionGroups.get(label);
      if (!arr.some((it) => it.key === entry.key)) {
        arr.push({ key: entry.key, summary: entry.summary });
      }
      entry.transitions.push({
        from: action.details?.from,
        to: action.details?.to,
        at: action.at,
      });
    }
    if (action.type === 'comment') {
      entry.comments += 1;
      commentCount += 1;
    }
    if (action.type === 'worklog') {
      entry.worklogs += 1;
      entry.workSeconds += Number(action.details?.timeSpentSeconds || 0);
      worklogCount += 1;
      workSeconds += Number(action.details?.timeSpentSeconds || 0);
    }
  }

  const lines = [];
  if (createdIssues.length) {
    lines.push(`- Tạo mới: ${listIssues(createdIssues, 6)}`);
  }

  if (transitionGroups.size) {
    const sorted = Array.from(transitionGroups.entries()).sort((a, b) => b[1].length - a[1].length);
    const maxGroups = 6;
    sorted.slice(0, maxGroups).forEach(([label, issues]) => {
      lines.push(`- ${label}: ${listIssues(issues, 5)}`);
    });
    if (sorted.length > maxGroups) {
      lines.push(`- +${sorted.length - maxGroups} nhóm chuyển trạng thái khác`);
    }
  }

  if (commentCount) {
    lines.push(`- Bình luận: ${commentCount} comment`);
  }
  if (worklogCount) {
    lines.push(`- Worklog: ${worklogCount} lần (${secondsToHhmm(workSeconds)})`);
  }

  if (!lines.length) {
    lines.push('- Không có hoạt động đáng kể trong ngày.');
  }

  return lines.join('\n');
};

export const buildIssueSnippets = (actorBlock, limit = 8) => {
  const byIssue = new Map();
  for (const action of actorBlock.actions) {
    if (!byIssue.has(action.issueKey)) {
      byIssue.set(action.issueKey, {
        key: action.issueKey,
        summary: action.issueSummary,
        description: truncate(action.issueDescription || '', 160),
      });
    }
  }
  const list = Array.from(byIssue.values()).slice(0, limit);
  return list
    .map((it) => {
      const parts = [`${it.key}: ${it.summary || ''}`.trim()];
      if (it.description) parts.push(it.description);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
};
