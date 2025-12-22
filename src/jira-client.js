import { Version2Client } from 'jira.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { toJiraDateTime } from './time.js';

const isPat = config.jira.authType === 'pat';

export const jiraClient = new Version2Client({
  host: config.jira.baseUrl,
  authentication: isPat
    ? { oauth2: { accessToken: config.jira.apiToken } }
    : { basic: { email: config.jira.email, apiToken: config.jira.apiToken } },
});

export const searchIssuesUpdatedInRange = async ({ projectKey, start, end }) => {
  const jql = `project = ${projectKey} AND updated >= "${toJiraDateTime(
    start
  )}" AND updated < "${toJiraDateTime(end)}" ORDER BY updated ASC`;
  const maxResults = 50;
  const keys = [];
  let startAt = 0;

  while (true) {
    const res = await jiraClient.issueSearch.searchForIssuesUsingJql({
      jql,
      startAt,
      maxResults,
      fields: ['summary', 'updated'],
    });
    const issues = Array.isArray(res.issues) ? res.issues : [];
    keys.push(...issues.map((it) => ({ key: it.key, updated: it.fields?.updated })));

    const total = typeof res.total === 'number' ? res.total : issues.length;
    if (keys.length >= total || issues.length === 0) break;
    startAt += issues.length;
  }

  logger.info({ jql, count: keys.length }, 'Fetched issue keys');
  return keys;
};

const fetchAllComments = async (issueKey, initial) => {
  const total = initial?.total ?? 0;
  const collected = initial?.comments ? [...initial.comments] : [];
  if (total <= collected.length) return collected;

  let startAt = collected.length;
  const maxResults = 50;
  while (startAt < total) {
    const res = await jiraClient.issueComments.getComments({
      issueIdOrKey: issueKey,
      startAt,
      maxResults,
    });
    if (Array.isArray(res.comments)) {
      collected.push(...res.comments);
      startAt += res.comments.length;
    } else {
      break;
    }
  }
  return collected;
};

const fetchAllWorklogs = async (issueKey, initial) => {
  const total = initial?.total ?? 0;
  const collected = initial?.worklogs ? [...initial.worklogs] : [];
  if (total <= collected.length) return collected;

  let startAt = collected.length;
  const maxResults = 100;
  while (startAt < total) {
    const res = await jiraClient.issueWorklogs.getIssueWorklogs({
      issueIdOrKey: issueKey,
      startAt,
      maxResults,
    });
    if (Array.isArray(res.worklogs)) {
      collected.push(...res.worklogs);
      startAt += res.worklogs.length;
    } else {
      break;
    }
  }
  return collected;
};

export const getIssueWithDetails = async (issueKey) => {
  const res = await jiraClient.issues.getIssue({
    issueIdOrKey: issueKey,
    fields: [
      'summary',
      'description',
      'status',
      'created',
      'updated',
      'assignee',
      'creator',
      'reporter',
      'comment',
      'worklog',
    ],
    expand: ['changelog'],
  });

  const comments = await fetchAllComments(issueKey, res.fields?.comment);
  const worklogs = await fetchAllWorklogs(issueKey, res.fields?.worklog);

  return {
    id: res.id,
    key: res.key,
    fields: res.fields ?? {},
    changelog: res.changelog ?? { histories: [] },
    comments,
    worklogs,
  };
};
