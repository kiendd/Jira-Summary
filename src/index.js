#!/usr/bin/env node
import { computeDayRange } from './time.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { parseArgs } from './cli.js';
import { collectActionsForRange } from './jira-actions.js';
import { groupActionsByActor } from './group-actions.js';
import { summarizeWithXlm } from './lmx-client.js';
import { renderHuman, renderJson } from './render.js';
import { buildLocalSummary, buildIssueSnippets, buildStatusTracking } from './summary-builder.js';
import { writePdfReport } from './pdf-writer.js';
import { buildGlobalPrompt } from './global-prompt.js';
import { writePrompt } from './prompt-writer.js';

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

  // Write combined prompt for all users (title only, no description)
  try {
    const globalPrompt = buildGlobalPrompt(grouped, dateLabel);
    writePrompt('all-users', globalPrompt);
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to write global prompt');
  }

  const summaries = new Map();
  const useXlm = !args.skipXlm;
  const requireXlm = args.requireXlm ?? config.lmx.required;
  for (const entry of grouped) {
    logger.info({ actor: entry.actor.name, actions: entry.actions.length, useXlm }, 'Summarizing actor');
    let summary = useXlm ? await summarizeWithXlm(entry, dateLabel, { requireXlm }) : null;
    if (!summary) summary = buildLocalSummary(entry);
    const issueNotes = buildIssueSnippets(entry);
    if (issueNotes) summary = `${summary}\n\nChi tiết issue:\n${issueNotes}`;
    const tracking = buildStatusTracking(entry);
    summary = `${summary}\n\n${tracking}`;
    const totals = `Tổng quan: created ${entry.stats.created}; status-change ${entry.stats.status}; comments ${entry.stats.comments}; worklogs ${entry.stats.worklogs}`;
    summary = `${summary}\n${totals}`;
    summaries.set(entry.actor.id, summary);
    logger.info({ actor: entry.actor.name }, 'Done summarizing actor');
    // Log per-user summary immediately
    logger.info({ actor: entry.actor.name, summary }, 'Actor summary ready');
  }

  if (args.json) {
    renderJson({ dateLabel, projectKey, grouped });
  } else {
    renderHuman({ dateLabel, projectKey, grouped, summaries });
  }

  try {
    const pdfPath = writePdfReport({ dateLabel, projectKey, grouped, summaries });
    logger.info(`PDF saved at ${pdfPath}`);
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to write PDF');
  }
};

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  process.exit(1);
});
