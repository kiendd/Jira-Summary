import { Version2Client } from 'jira.js';
import pLimit from 'p-limit';
import { logger } from './logger.js';
import { toJiraDateTime } from './time.js';

export const createJiraClient = (projectConfig) => {
  const isPat = projectConfig.jira.authType === 'pat';
  return new Version2Client({
    host: projectConfig.jira.baseUrl,
    authentication: isPat
      ? { oauth2: { accessToken: projectConfig.jira.apiToken } }
      : { basic: { email: projectConfig.jira.email, apiToken: projectConfig.jira.apiToken } },
  });
};

export const searchIssuesUpdatedInRange = async ({ projectKey, start, end, jiraClient, maxConcurrency = 5 }) => {
  const jql = `project = ${projectKey} AND updated >= "${toJiraDateTime(
    start
  )}" AND updated < "${toJiraDateTime(end)}" ORDER BY updated ASC`;
  const limit = pLimit(maxConcurrency);
  const maxResults = 50;
  const keys = [];
  let startAt = 0;

  while (true) {
    const res = await limit(() =>
      jiraClient.issueSearch.searchForIssuesUsingJql({
        jql,
        startAt,
        maxResults,
        fields: ['summary', 'updated'],
      })
    );

    const issues = Array.isArray(res.issues) ? res.issues : [];
    keys.push(...issues.map((it) => ({ key: it.key, updated: it.fields?.updated })));

    const total = typeof res.total === 'number' ? res.total : issues.length;
    if (keys.length >= total || issues.length === 0) break;
    startAt += issues.length;
  }

  logger.info({ jql, count: keys.length }, 'Fetched issue keys');
  return keys;
};

const fetchAllComments = async (issueKey, initial, jiraClient) => {
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

const fetchAllWorklogs = async (issueKey, initial, jiraClient) => {
  const total = initial?.total ?? 0;
  const collected = initial?.worklogs ? [...initial.worklogs] : [];
  if (total <= collected.length) return collected;

  let startAt = collected.length;
  const maxResults = 100;
  while (startAt < total) {
    const res = await jiraClient.issueWorklogs.getIssueWorklog(
      {
        issueIdOrKey: issueKey,
        startAt,
        maxResults,
      }
    );
    if (Array.isArray(res.worklogs)) {
      collected.push(...res.worklogs);
      startAt += res.worklogs.length;
    } else {
      break;
    }
  }
  return collected;
};

export const getIssueWithDetails = async (issueKey, jiraClient) => {
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

  const comments = await fetchAllComments(issueKey, res.fields?.comment, jiraClient);
  const worklogs = await fetchAllWorklogs(issueKey, res.fields?.worklog, jiraClient);

  return {
    id: res.id,
    key: res.key,
    fields: res.fields ?? {},
    changelog: res.changelog ?? { histories: [] },
    comments,
    worklogs,
  };
};

export const getAllUsersInProject = async (projectKey, jiraClient, maxConcurrency = 5) => {
  const limit = pLimit(maxConcurrency);
  try {
    const roles = await jiraClient.projectRoles.getProjectRoles({
      projectIdOrKey: projectKey,
    });
    const roleLinks = Object.values(roles || {}).filter((v) => typeof v === 'string');
    const users = new Map();
    for (const link of roleLinks) {
      try {
        const res = await jiraClient.projectRoles.getProjectRole({
          projectIdOrKey: projectKey,
          id: link.split('/').pop(),
        });
        (res?.actors || []).forEach((actor) => {
          if (actor?.actorGroup) return;
          const id = actor?.actorUser?.accountId || actor?.actorUser?.displayName || actor?.displayName;
          const name = actor?.displayName || actor?.actorUser?.displayName;
          const email = actor?.actorUser?.emailAddress || '';
          if (id && name) users.set(id, { name, email });
        });
      } catch (err) {
        logger.warn({ err: err.message, link }, 'Failed to read project role');
      }
    }

    const entries = Array.from(users.entries()).map(([id, info]) => ({ id, name: info.name, email: info.email || '' }));

    await Promise.all(
      entries.map((u) =>
        limit(async () => {
          if (u.email) return;
          try {
            const res = await jiraClient.users.getUser({ accountId: u.id });
            const email = res?.emailAddress || '';
            if (email) u.email = email;
          } catch (err) {
            logger.debug({ err: err.message, accountId: u.id }, 'Failed to fetch user email');
          }
        })
      )
    );

    return entries;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to fetch project users');
    return [];
  }
};
