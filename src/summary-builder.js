import { secondsToHhmm, truncate, sanitizeIssueSummary } from './utils.js';

const listIssues = (items, limit = 5) => {
  if (!items.length) return '';
  const shown = items.slice(0, limit).map((it) => {
    const summary = sanitizeIssueSummary(it.summary);
    return `${it.key}${summary ? ` (${summary})` : ''}`;
  });
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest} more` : shown.join(', ');
};

const buildStatusChain = (transitions) => {
  if (!transitions.length) return '';
  const sorted = [...transitions].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const chain = [];
  for (const t of sorted) {
    const from = t.from || '';
    const to = t.to || '';
    if (!chain.length && from) chain.push(from);
    if (to) {
      const last = chain[chain.length - 1];
      if (to !== last) chain.push(to);
    }
  }
  const uniq = chain.filter(Boolean);
  if (!uniq.length) return '';
  const steps = uniq.length > 1 ? ` (${uniq.length - 1} steps)` : '';
  return `${uniq.join(' -> ')}${steps}`;
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
        summary: sanitizeIssueSummary(action.issueSummary),
        created: false,
        transitions: [],
        comments: 0,
        worklogs: 0,
        workSeconds: 0,
      });
    }
    const entry = byIssue.get(key);
    if (!entry.description && action.issueDescription) {
      entry.description = truncate(sanitizeIssueSummary(action.issueDescription), 180);
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
    lines.push(`- Created: ${listIssues(createdIssues, 6)}`);
  }

  if (transitionGroups.size) {
    const sorted = Array.from(transitionGroups.entries()).sort((a, b) => b[1].length - a[1].length);
    const maxGroups = 6;
    sorted.slice(0, maxGroups).forEach(([label, issues]) => {
      lines.push(`- Status: ${label}: ${listIssues(issues, 5)}`);
    });
    if (sorted.length > maxGroups) {
      lines.push(`- Other status groups: +${sorted.length - maxGroups}`);
    }
  }

  if (commentCount) {
    lines.push(`- Comments: ${commentCount}`);
  }
  if (worklogCount) {
    lines.push(`- Worklog: ${worklogCount} entries (${secondsToHhmm(workSeconds)})`);
  }

  if (!lines.length) {
    lines.push('- No significant activity today.');
  }

  return `Daily summary:\n${lines.join('\n')}`;
};

export const buildStatusTracking = (actorBlock) => {
  const byIssue = new Map();

  for (const action of actorBlock.actions) {
    const key = action.issueKey;
    if (!byIssue.has(key)) {
      byIssue.set(key, {
        key: action.issueKey,
        summary: sanitizeIssueSummary(action.issueSummary),
        created: null,
        transitions: [],
        comments: [],
        worklogs: [],
        others: [],
      });
    }
    const entry = byIssue.get(key);
    if (action.type === 'created') {
      entry.created = action.details?.status || '';
      continue;
    }
    if (action.type === 'status-change') {
      entry.transitions.push({
        from: action.details?.from,
        to: action.details?.to,
        at: action.at,
      });
      continue;
    }
    if (action.type === 'comment') {
      const excerpt = truncate(action.details?.excerpt, 160);
      if (excerpt) entry.comments.push(excerpt);
      else entry.comments.push('(no content)');
      continue;
    }
    if (action.type === 'worklog') {
      entry.worklogs.push({
        seconds: Number(action.details?.timeSpentSeconds || 0),
        note: action.details?.comment ? truncate(action.details.comment, 160) : '',
      });
      continue;
    }
    entry.others.push(action.type || 'update');
  }

  const issues = Array.from(byIssue.values());
  if (!issues.length) return '- No changes recorded.';

  const lines = [];
  issues.forEach((iss) => {
    const title = iss.summary ? `${iss.key}: ${iss.summary}` : iss.key;
    lines.push(`- ${title}`);

    if (iss.created !== null) {
      const statusPart = iss.created ? `: ${iss.created}` : '';
      lines.push(`  - Created${statusPart}`);
    }

    if (iss.transitions.length) {
      const chain = buildStatusChain(iss.transitions);
      if (chain) {
        lines.push(`  - Status: ${chain}`);
      }
    }

    if (iss.comments.length) {
      lines.push(`  - Comments: ${iss.comments.join('; ')}`);
    }

    if (iss.worklogs.length) {
      const totalSeconds = iss.worklogs.reduce((sum, w) => sum + w.seconds, 0);
      const notes = iss.worklogs.map((w) => w.note).filter(Boolean);
      const notesPart = notes.length ? ` | notes: ${notes.join('; ')}` : '';
      lines.push(`  - Worklog: ${iss.worklogs.length} entries (${secondsToHhmm(totalSeconds)})${notesPart}`);
    }

    if (iss.others.length) {
      const unique = Array.from(new Set(iss.others));
      lines.push(`  - Other updates: ${unique.join(', ')}`);
    }
  });

  return lines.join('\n');
};

export const buildIssuesList = (actorBlock, limit = 5) => {
  const byIssue = new Map();
  for (const action of actorBlock.actions) {
    if (!byIssue.has(action.issueKey)) {
      byIssue.set(action.issueKey, {
        key: action.issueKey,
        summary: sanitizeIssueSummary(action.issueSummary),
      });
    }
  }
  const list = Array.from(byIssue.values()).slice(0, limit);
  if (!list.length) return '';
  return list
    .map((it) => (it.summary ? `- ${it.key}: ${it.summary}` : `- ${it.key}`))
    .join('\n');
};
