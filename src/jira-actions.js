import { DateTime } from 'luxon';
import pLimit from 'p-limit';
import { searchIssuesUpdatedInRange, getIssueWithDetails } from './jira-client.js';
import { logger } from './logger.js';
import { isWithinRange } from './time.js';
import { truncate, buildIssueUrl, buildCommentUrl } from './utils.js';

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
  if (!user) return fallback || { id: 'unknown', name: 'Unknown', email: '' };
  const id = user.accountId || user.key || user.name || user.emailAddress || fallback?.id || 'unknown';
  const name = user.displayName || user.name || user.emailAddress || fallback?.name || 'Unknown';
  const email = user.emailAddress || '';
  return { id, name, email };
};

const normalizeTimestamp = (value) => {
  const dt = DateTime.fromISO(value, { zone: 'utc' });
  if (dt.isValid) return dt.toUTC().toISO();
  const asDate = new Date(value);
  return Number.isFinite(asDate.getTime()) ? asDate.toISOString() : value;
};

const addCreatedAction = (issue, range, actions, jiraBaseUrl) => {
  const created = issue.fields?.created;
  if (!created || !isWithinRange(created, range.start, range.end)) return;
  actions.push({
    type: 'created',
    at: normalizeTimestamp(created),
    issueKey: issue.key,
    issueSummary: truncate(issue.fields?.summary, 120),
    issueDescription: truncate(safeText(issue.fields?.description), 180),
    issueUrl: buildIssueUrl(issue.key, jiraBaseUrl),
    actor: normalizeUser(issue.fields?.creator || issue.fields?.reporter),
    details: {
      status: issue.fields?.status?.name,
    },
  });
};

const addStatusActions = (issue, range, actions, jiraBaseUrl) => {
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
      issueUrl: buildIssueUrl(issue.key, jiraBaseUrl),
      actor: normalizeUser(history.author, issue.fields?.assignee),
      details: {
        from: statusItem.fromString || statusItem.from || '',
        to: statusItem.toString || statusItem.to || '',
      },
    });
  }
};

const addCommentActions = (issue, range, actions, timezone, jiraBaseUrl) => {
  const comments = issue.comments || [];
  for (const comment of comments) {
    if (!isWithinRange(comment.created, range.start, range.end)) continue;
    const commentId = comment.id || comment.commentId;
    actions.push({
      type: 'comment',
      at: normalizeTimestamp(comment.created),
      issueKey: issue.key,
      issueSummary: truncate(issue.fields?.summary, 120),
      issueDescription: truncate(safeText(issue.fields?.description), 180),
      issueUrl: buildIssueUrl(issue.key, jiraBaseUrl),
      actor: normalizeUser(comment.author, issue.fields?.assignee),
      details: {
        excerpt: truncate(safeText(comment.body), 200),
        createdLocal: DateTime.fromISO(comment.created).setZone(timezone).toFormat('HH:mm'),
        commentId,
        commentUrl: buildCommentUrl(issue.key, commentId, jiraBaseUrl),
      },
    });
  }
};

const addWorklogActions = (issue, range, actions, timezone, jiraBaseUrl) => {
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
      issueUrl: buildIssueUrl(issue.key, jiraBaseUrl),
      actor: normalizeUser(worklog.author || worklog.updateAuthor, issue.fields?.assignee),
      details: {
        timeSpentSeconds: worklog.timeSpentSeconds,
        comment: truncate(safeText(worklog.comment || worklog.description), 160),
        startedLocal: DateTime.fromISO(started).setZone(timezone).toFormat('HH:mm'),
      },
    });
  }
};

export const collectActionsForRange = async ({ range, projectConfig, jiraClient }) => {
  const keys = await searchIssuesUpdatedInRange({
    projectKey: projectConfig.jira.projectKey,
    start: range.start,
    end: range.end,
    jiraClient,
    maxConcurrency: projectConfig.maxConcurrency,
  });
  const actions = [];
  const limit = pLimit(projectConfig.maxConcurrency);

  const fetchIssue = async (key) => {
    try {
      return await getIssueWithDetails(key, jiraClient);
    } catch (err) {
      logger.error({ key, err: err.message }, 'Failed to fetch issue');
      return null;
    }
  };

  const issues = await Promise.all(keys.map(({ key }) => limit(() => fetchIssue(key))));
  for (const issue of issues) {
    if (!issue) continue;
    addCreatedAction(issue, range, actions, projectConfig.jira.baseUrl);
    addStatusActions(issue, range, actions, projectConfig.jira.baseUrl);
    addCommentActions(issue, range, actions, projectConfig.timezone, projectConfig.jira.baseUrl);
    addWorklogActions(issue, range, actions, projectConfig.timezone, projectConfig.jira.baseUrl);
  }

  actions.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  return actions;
};
