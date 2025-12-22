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

  const targets = filtered;

  // Skip combined prompt; only per-user summaries are generated

  const summaries = new Map();
  const trackings = new Map();
  const condenseSummary = (text, maxLines = 6) => {
    const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, maxLines).join('\n');
  };
  const useXlm = !args.skipXlm;
  const requireXlm = args.requireXlm ?? config.lmx.required;
  for (const entry of targets) {
    logger.info({ actor: entry.actor.name, actions: entry.actions.length, useXlm }, 'Summarizing actor');
    let summary = useXlm ? await summarizeWithXlm(entry, dateLabel, { requireXlm }) : null;
    if (!summary) summary = buildLocalSummary(entry);
    const summaryForPdf = condenseSummary(summary);
    const tracking = buildStatusTracking(entry);

    summaries.set(entry.actor.id, summaryForPdf);
    trackings.set(entry.actor.id, tracking);

    logger.info({ actor: entry.actor.name }, 'Done summarizing actor');
    // Log per-user summary immediately in a clearer format
    logger.info(`\n===== ${entry.actor.name} =====\n${summaryForPdf}\n\n${tracking}\n`);
  }

  if (args.json) {
    renderJson({ dateLabel, projectKey, grouped });
  } else {
    renderHuman({ dateLabel, projectKey, grouped, summaries });
  }

  try {
    const pdfPath = writePdfReport({ dateLabel, projectKey, grouped: targets, summaries, trackings });
    logger.info(`PDF saved at ${pdfPath}`);
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to write PDF');
  }
};

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  process.exit(1);
});
