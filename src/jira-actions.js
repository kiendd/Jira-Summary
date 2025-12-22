import pLimit from 'p-limit';
import { DateTime } from 'luxon';
import { searchIssuesUpdatedInRange, getIssueWithDetails } from './jira-client.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { isWithinRange } from './time.js';
import { truncate, buildIssueUrl } from './utils.js';

const limit = pLimit(config.maxConcurrency);

const safeText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const normalizeUser = (user, fallback) => {
  if (!user) return fallback || { id: 'unknown', name: 'Unknown' };
  const id = user.accountId || user.key || user.name || user.emailAddress || fallback?.id || 'unknown';
  const name = user.displayName || user.name || user.emailAddress || fallback?.name || 'Unknown';
  return { id, name };
};

const normalizeTimestamp = (value) => {
  const dt = DateTime.fromISO(value, { zone: 'utc' });
  if (dt.isValid) return dt.toUTC().toISO();
  const asDate = new Date(value);
  return Number.isFinite(asDate.getTime()) ? asDate.toISOString() : value;
};

const addCreatedAction = (issue, range, actions) => {
  const created = issue.fields?.created;
  if (!created || !isWithinRange(created, range.start, range.end)) return;
  actions.push({
    type: 'created',
    at: normalizeTimestamp(created),
    issueKey: issue.key,
    issueSummary: truncate(issue.fields?.summary, 120),
    issueDescription: truncate(safeText(issue.fields?.description), 180),
    issueUrl: buildIssueUrl(issue.key),
    actor: normalizeUser(issue.fields?.creator || issue.fields?.reporter),
    details: {
      status: issue.fields?.status?.name,
    },
  });
};

const addStatusActions = (issue, range, actions) => {
  const histories = issue.changelog?.histories || [];
  for (const history of histories) {
    if (!isWithinRange(history.created, range.start, range.end)) continue;
    const statusItem = history.items?.find((item) => item.field?.toLowerCase() === 'status');
    if (!statusItem) continue;
    actions.push({
      type: 'status-change',
      at: normalizeTimestamp(history.created),
    issueKey: issue.key,
    issueSummary: truncate(issue.fields?.summary, 120),
    issueDescription: truncate(safeText(issue.fields?.description), 180),
    issueUrl: buildIssueUrl(issue.key),
    actor: normalizeUser(history.author, issue.fields?.assignee),
    details: {
      from: statusItem.fromString || statusItem.from || '',
      to: statusItem.toString || statusItem.to || '',
      },
    });
  }
};

const addCommentActions = (issue, range, actions, timezone) => {
  const comments = issue.comments || [];
  for (const comment of comments) {
    if (!isWithinRange(comment.created, range.start, range.end)) continue;
    actions.push({
      type: 'comment',
      at: normalizeTimestamp(comment.created),
    issueKey: issue.key,
    issueSummary: truncate(issue.fields?.summary, 120),
    issueDescription: truncate(safeText(issue.fields?.description), 180),
    issueUrl: buildIssueUrl(issue.key),
    actor: normalizeUser(comment.author, issue.fields?.assignee),
    details: {
      excerpt: truncate(safeText(comment.body), 200),
      createdLocal: DateTime.fromISO(comment.created).setZone(timezone).toFormat('HH:mm'),
      },
    });
  }
};

const addWorklogActions = (issue, range, actions, timezone) => {
  const worklogs = issue.worklogs || [];
  for (const worklog of worklogs) {
    const started = worklog.started || worklog.startedAt;
    if (!started || !isWithinRange(started, range.start, range.end)) continue;
    actions.push({
      type: 'worklog',
      at: normalizeTimestamp(started),
    issueKey: issue.key,
    issueSummary: truncate(issue.fields?.summary, 120),
    issueDescription: truncate(safeText(issue.fields?.description), 180),
    issueUrl: buildIssueUrl(issue.key),
    actor: normalizeUser(worklog.author || worklog.updateAuthor, issue.fields?.assignee),
    details: {
      timeSpentSeconds: worklog.timeSpentSeconds,
      comment: truncate(safeText(worklog.comment || worklog.description), 160),
        startedLocal: DateTime.fromISO(started).setZone(timezone).toFormat('HH:mm'),
      },
    });
  }
};

export const collectActionsForRange = async (range, projectKey) => {
  const keys = await searchIssuesUpdatedInRange({ projectKey, start: range.start, end: range.end });
  const actions = [];

  const fetchIssue = async (key) => {
    try {
      return await getIssueWithDetails(key);
    } catch (err) {
      logger.error({ key, err: err.message }, 'Failed to fetch issue');
      return null;
    }
  };

  const issues = await Promise.all(keys.map(({ key }) => limit(() => fetchIssue(key))));
  for (const issue of issues) {
    if (!issue) continue;
    addCreatedAction(issue, range, actions);
    addStatusActions(issue, range, actions);
    addCommentActions(issue, range, actions, config.timezone);
    addWorklogActions(issue, range, actions, config.timezone);
  }

  actions.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  return actions;
};
