#!/usr/bin/env node
import { computeDayRange } from './time.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { parseArgs } from './cli.js';
import { collectActionsForRange } from './jira-actions.js';
import { groupActionsByActor } from './group-actions.js';
import { summarizeWithXlm } from './lmx-client.js';
import { renderHuman, renderJson } from './render.js';
import { buildLocalSummary, buildStatusTracking, buildIssuesList } from './summary-builder.js';
import { writePdfReport } from './pdf-writer.js';
import { buildGlobalPrompt } from './global-prompt.js';
import { writePrompt } from './prompt-writer.js';
import { applyUserFilters, writeActorList } from './user-filter.js';
import { loadUserConfig } from './user-config.js';
import { sendFchatReport } from './fchat-client.js';

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const projectKey = args.project || config.jira.projectKey;
  if (!projectKey) {
    throw new Error('Missing project key. Provide --project or set JIRA_PROJECT_KEY.');
  }

  const range = computeDayRange(args.date, config.timezone);
  const dateLabel = range.start.setZone(config.timezone).toFormat('yyyy-LL-dd');

  logger.info({ projectKey, date: dateLabel }, 'Collecting Jira actions');
  const actions = await collectActionsForRange(range, projectKey);
  logger.info({ projectKey, date: dateLabel, actionCount: actions.length }, 'Collected actions');
  const grouped = groupActionsByActor(actions);
  logger.info({ users: grouped.length }, 'Grouped actions by actor');

  // Write actor list for reference
  writeActorList(grouped).then((actorsPath) => {
    if (actorsPath) {
      logger.info(`Actors list written to ${actorsPath}`);
    }
  });

  // Apply include/exclude filters
  const filtered = applyUserFilters(grouped);
  if (filtered.length !== grouped.length) {
    logger.info({ before: grouped.length, after: filtered.length }, 'Filtered actors by config');
  }

  const configUsers = loadUserConfig('users.txt');
  let targets = filtered;
  if (configUsers?.length) {
    const norm = (v) => (v || '').toLowerCase();
    targets = filtered.filter((entry) =>
      configUsers.some((u) => norm(u.name) === norm(entry.actor.name) || norm(u.name) === norm(entry.actor.id))
    );
    // Add placeholders for missing users (no actions)
    const existingKeys = new Set(targets.map((t) => norm(t.actor.name)));
    configUsers.forEach((u) => {
      const key = norm(u.name);
      if (!existingKeys.has(key)) {
        targets.push({
          actor: { id: u.name, name: u.name, email: '' },
          actions: [],
          stats: { created: 0, status: 0, comments: 0, worklogs: 0, worklogSeconds: 0 },
        });
      }
    });
  }

  // Skip combined prompt; only per-user summaries are generated

  const summaries = new Map();
  const trackings = new Map();
  const warnings = [];
  const condenseSummary = (text, maxLines = 6) => {
    const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, maxLines).join('\n');
  };
  const useXlm = !args.skipXlm;
  const requireXlm = args.requireXlm ?? config.lmx.required;
  for (const entry of targets) {
    logger.info({ actor: entry.actor.name, actions: entry.actions.length, useXlm }, 'Summarizing actor');
    let summary = null;
    let tracking = '';

    if (entry.actions.length === 0) {
      summary = 'Không có hoạt động trong ngày.';
      tracking = '';
    } else {
      summary = useXlm ? await summarizeWithXlm(entry, dateLabel, { requireXlm }) : null;
      if (!summary) summary = buildLocalSummary(entry);
      tracking = buildStatusTracking(entry);
    }

    const summaryForPdf = condenseSummary(summary);

    summaries.set(entry.actor.id, summaryForPdf);
    trackings.set(entry.actor.id, tracking);

    logger.info({ actor: entry.actor.name }, 'Done summarizing actor');
    // Log per-user summary immediately in a clearer format
    logger.info(`\n===== ${entry.actor.name} =====\n${summaryForPdf}\n\n${tracking}\n`);
  }

  // Collect warnings for users with no actions
  warnings.push(
    ...targets
      .filter((entry) => !entry.actions.length)
      .map((entry) => `No actions for user: ${entry.actor.name}`)
  );

  if (args.json) {
    renderJson({ dateLabel, projectKey, grouped });
  } else {
    renderHuman({ dateLabel, projectKey, grouped, summaries });
  }

  try {
    const pdfPath = await writePdfReport({ dateLabel, projectKey, grouped: targets, summaries, trackings, warnings });
    logger.info(`PDF saved at ${pdfPath}`);
    await sendFchatReport({ projectKey, dateLabel, targets, summaries, pdfPath });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to write PDF');
  }
};

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  process.exit(1);
});
