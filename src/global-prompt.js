import { DateTime } from 'luxon';
import { config } from './config.js';
import { loadTemplate } from './prompt-loader.js';

const actionLine = (action) => {
  const atLocal = DateTime.fromISO(action.at || action.details?.startedLocal, { zone: 'utc' })
    .setZone(config.timezone)
    .toFormat('HH:mm');
  if (action.type === 'status-change') {
    return `- [${atLocal}] ${action.issueKey} ${action.details.from} -> ${action.details.to} | ${action.issueSummary}`;
  }
  if (action.type === 'comment') {
    return `- [${atLocal}] comment ${action.issueKey}: ${action.details.excerpt ?? ''}`;
  }
  if (action.type === 'worklog') {
    const mins = Math.round((action.details.timeSpentSeconds || 0) / 60);
    return `- [${atLocal}] worklog ${mins}m ${action.issueKey}: ${action.issueSummary}`;
  }
  if (action.type === 'created') {
    return `- [${atLocal}] created ${action.issueKey} (${action.issueSummary}) status ${action.details.status || ''}`;
  }
  return `- [${atLocal}] ${action.type} ${action.issueKey}: ${action.issueSummary}`;
};

export const buildGlobalPrompt = () => '';
