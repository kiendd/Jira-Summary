import { config } from './config.js';
import { loadTemplate } from './prompt-loader.js';

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

export const buildGlobalPrompt = (grouped, dateLabel) => {
  const tmpl = loadTemplate('all-users');
  const usersBlock = grouped
    .map((entry) => {
      const lines = buildIssueLines(entry);
      return `## ${entry.actor.name}\n${lines}`;
    })
    .join('\n\n');

  return tmpl
    .replace(/{{DATE}}/g, dateLabel)
    .replace(/{{TIMEZONE}}/g, config.timezone)
    .replace(/{{PROJECT_KEY}}/g, config.jira.projectKey || '')
    .replace(/{{USERS_BLOCK}}/g, usersBlock);
};
