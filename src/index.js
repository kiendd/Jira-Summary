#!/usr/bin/env node
import { computeDayRange } from './time.js';
import { loadProjectConfig, loadRootConfig } from './config.js';
import { logger } from './logger.js';
import { parseArgs } from './cli.js';
import { collectActionsForRange } from './jira-actions.js';
import { groupActionsByActor } from './group-actions.js';
import { summarizeWithXlm } from './lmx-client.js';
import { renderHuman, renderJson } from './render.js';
import { buildLocalSummary, buildStatusTracking } from './summary-builder.js';
import { writePdfReport } from './pdf-writer.js';
import { applyUserFilters, writeActorList } from './user-filter.js';
import { sendFchatReport } from './fchat-client.js';
import { createJiraClient } from './jira-client.js';

const resolveProjectIds = (projectArg, rootConfig) => {
  const normalize = (v) => (v || '').trim();
  const entries = Object.entries(rootConfig.projects || {});
  const enabledProjects = entries.filter(([, cfg]) => cfg?.enabled !== false).map(([id]) => id);
  const allProjects = entries.map(([id]) => id);
  if (projectArg) {
    const parts = projectArg
      .split(',')
      .map((p) => normalize(p))
      .filter(Boolean);
    if (parts.length === 1 && parts[0].toLowerCase() === 'all') {
      return allProjects;
    }
    const unique = Array.from(new Set(parts));
    const disabled = unique.filter((id) => !enabledProjects.includes(id));
    if (disabled.length) {
      logger.warn({ disabled }, 'Some requested projects are disabled in config and will be skipped');
    }
    const allowed = unique.filter((id) => enabledProjects.includes(id));
    return allowed;
  }
  const fallback = process.env.DEFAULT_PROJECT || rootConfig.defaultProject;
  if (fallback) return [fallback];
  if (enabledProjects.length) return enabledProjects;
  throw new Error('No projects configured. Please define projects in projects.config.yaml.');
};

const normalizeUsersList = (users) =>
  (users || [])
    .map((u) => (typeof u === 'string' ? u : u?.name || ''))
    .map((u) => u.trim())
    .filter(Boolean);

const processProject = async (projectConfig, args, range, dateLabel) => {
  const projectKey = projectConfig.jira.projectKey;
  const jiraClient = createJiraClient(projectConfig);

  logger.info({ projectKey, date: dateLabel }, 'Collecting Jira actions');
  const actions = await collectActionsForRange({ range, projectConfig, jiraClient });
  logger.info({ projectKey, date: dateLabel, actionCount: actions.length }, 'Collected actions');
  const grouped = groupActionsByActor(actions);
  logger.info({ users: grouped.length }, 'Grouped actions by actor');

  // Write actor list for reference
  writeActorList(grouped, projectConfig, jiraClient).then((actorsPath) => {
    if (actorsPath) {
      logger.info(`Actors list written to ${actorsPath}`);
    }
  });

  // Apply include/exclude filters
  const configUsers = normalizeUsersList(projectConfig.users);
  const filtered = applyUserFilters(grouped, configUsers);
  if (filtered.length !== grouped.length) {
    logger.info({ before: grouped.length, after: filtered.length }, 'Filtered actors by config');
  }

  let targets = filtered;
  if (configUsers?.length) {
    const norm = (v) => (v || '').toLowerCase();
    targets = filtered.filter((entry) =>
      configUsers.some((u) => norm(u) === norm(entry.actor.name) || norm(u) === norm(entry.actor.id))
    );
    // Add placeholders for missing users (no actions)
    const existingKeys = new Set(targets.map((t) => norm(t.actor.name)));
    configUsers.forEach((u) => {
      const key = norm(u);
      if (!existingKeys.has(key)) {
        targets.push({
          actor: { id: u, name: u, email: '' },
          actions: [],
          stats: { created: 0, status: 0, comments: 0, worklogs: 0, worklogSeconds: 0 },
        });
      }
    });
  }

  const summaries = new Map();
  const trackings = new Map();
  const warnings = [];
  const condenseSummary = (text, maxLines = 6) => {
    const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, maxLines).join('\n');
  };
  const useXlm = !args.skipXlm;
  const requireXlm = args.requireXlm ?? projectConfig.lmx.required;
  for (const entry of targets) {
    logger.info({ actor: entry.actor.name, actions: entry.actions.length, useXlm }, 'Summarizing actor');
    let summary = null;
    let tracking = '';

    if (entry.actions.length === 0) {
      summary = 'Không có hoạt động trong ngày.';
      tracking = '';
    } else {
      summary = useXlm ? await summarizeWithXlm(entry, dateLabel, projectConfig, { requireXlm }) : null;
      if (!summary) summary = buildLocalSummary(entry);
      tracking = buildStatusTracking(entry);
    }

    const summaryForPdf = condenseSummary(summary);

    summaries.set(entry.actor.id, summaryForPdf);
    trackings.set(entry.actor.id, tracking);

    logger.info({ actor: entry.actor.name }, 'Done summarizing actor');
    logger.info(`\n===== ${entry.actor.name} =====\n${summaryForPdf}\n\n${tracking}\n`);
  }

  warnings.push(
    ...targets
      .filter((entry) => !entry.actions.length)
      .map((entry) => `No actions for user: ${entry.actor.name}`)
  );

  const outputEntries = targets;
  if (args.json) {
    renderJson({ dateLabel, projectKey, grouped: outputEntries, timezone: projectConfig.timezone });
  } else {
    renderHuman({ dateLabel, projectKey, grouped: outputEntries, summaries, timezone: projectConfig.timezone });
  }

  try {
    const pdfPath = await writePdfReport({
      dateLabel,
      projectKey,
      timezone: projectConfig.timezone,
      grouped: targets,
      summaries,
      trackings,
      warnings,
    });
    logger.info(`PDF saved at ${pdfPath}`);
    await sendFchatReport({ projectConfig, dateLabel, targets, summaries, pdfPath });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to write PDF');
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const rootConfig = loadRootConfig();
  const projectIds = resolveProjectIds(args.project, rootConfig);
  if (!projectIds.length) {
    throw new Error('No enabled projects to run. Please specify --project or enable projects in config.yaml.');
  }

  for (const projectId of projectIds) {
    const projectConfig = loadProjectConfig(projectId, rootConfig.configPath);
    const range = computeDayRange(args.date, projectConfig.timezone);
    const dateLabel = range.start.setZone(projectConfig.timezone).toFormat('yyyy-LL-dd');
    logger.info({ projectId, projectKey: projectConfig.jira.projectKey }, 'Starting project run');
    await processProject(projectConfig, args, range, dateLabel);
  }
};

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  process.exit(1);
});
