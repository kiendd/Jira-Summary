#!/usr/bin/env node
/**
 * Backfill missing days in last-actions.json
 *
 * Usage:
 *   node scripts/backfill.js                          # auto-detect from last-actions.json → yesterday
 *   node scripts/backfill.js --from 2026-01-20        # from a specific date → yesterday
 *   node scripts/backfill.js --from 2026-01-20 --to 2026-03-21
 *   node scripts/backfill.js --project FPLACE         # single project
 *   node scripts/backfill.js --dry-run                # preview without saving history
 */
import { DateTime } from 'luxon';
import { loadProjectConfig, loadRootConfig } from '../src/config.js';
import { createJiraClient } from '../src/jira/jira-client.js';
import { collectActionsForRange } from '../src/jira/jira-actions.js';
import { groupActionsByActor } from '../src/pipeline/group-actions.js';
import { applyUserFilters } from '../src/pipeline/user-filter.js';
import { computeDayRange } from '../src/time.js';
import {
  loadLastActionHistory,
  saveLastActionHistory,
  updateLastActionHistory,
} from '../src/pipeline/action-history.js';
import { logger } from '../src/logger.js';

// --- CLI args ---
const parseArgs = (argv) => {
  const args = { from: null, to: null, project: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if ((v === '--from' || v === '-f') && argv[i + 1]) { args.from = argv[++i]; }
    else if ((v === '--to' || v === '-t') && argv[i + 1]) { args.to = argv[++i]; }
    else if ((v === '--project' || v === '-p') && argv[i + 1]) { args.project = argv[++i]; }
    else if (v === '--dry-run') { args.dryRun = true; }
  }
  return args;
};

// --- Helpers ---
const pad = (s, n = 24) => String(s).padEnd(n);

const normalizeUsers = (users) =>
  (users || [])
    .map((u) => (typeof u === 'string' ? u : u?.name || ''))
    .map((u) => u.trim())
    .filter(Boolean);

const getWeekdays = (fromISO, toISO, timezone) => {
  let cursor = DateTime.fromISO(fromISO, { zone: timezone }).startOf('day');
  const end = DateTime.fromISO(toISO, { zone: timezone }).startOf('day');
  const days = [];
  while (cursor <= end) {
    if (cursor.weekday <= 5) days.push(cursor.toFormat('yyyy-LL-dd'));
    cursor = cursor.plus({ days: 1 });
  }
  return days;
};

// Auto-detect earliest unsynced date for a project from history
const getAutoFrom = (history, projectKey, timezone) => {
  const projectHistory = history[projectKey];
  if (!projectHistory || !Object.keys(projectHistory).length) {
    // No history: start from 30 business days ago
    return DateTime.now().setZone(timezone).minus({ days: 45 }).toFormat('yyyy-LL-dd');
  }
  const dates = Object.values(projectHistory)
    .map((e) => e?.lastActionDate)
    .filter(Boolean)
    .sort();
  const earliest = dates[0];
  // Start from day after the earliest recorded date
  return DateTime.fromISO(earliest, { zone: timezone }).plus({ days: 1 }).toFormat('yyyy-LL-dd');
};

// --- Main ---
const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const rootConfig = loadRootConfig();

  // Resolve projects
  const allEntries = Object.entries(rootConfig.projects || {});
  const projectIds = args.project
    ? [args.project]
    : allEntries.filter(([, cfg]) => cfg?.enabled !== false).map(([id]) => id);

  if (!projectIds.length) throw new Error('No enabled projects found.');

  const history = loadLastActionHistory();
  const yesterday = DateTime.now().minus({ days: 1 }).toFormat('yyyy-LL-dd');

  let totalDays = 0;
  let totalActions = 0;

  for (const projectId of projectIds) {
    const projectConfig = loadProjectConfig(projectId, rootConfig.configPath);
    const tz = projectConfig.timezone;
    const jiraClient = createJiraClient(projectConfig);
    const configUsers = normalizeUsers(projectConfig.users);

    const fromDate = args.from || getAutoFrom(history, projectConfig.jira.projectKey, tz);
    const toDate = args.to || yesterday;

    if (fromDate > toDate) {
      logger.info(`[${projectId}] Already up-to-date (from=${fromDate} > to=${toDate}), skipping.`);
      continue;
    }

    const days = getWeekdays(fromDate, toDate, tz);
    logger.info(`[${projectId}] Backfilling ${days.length} weekdays: ${fromDate} → ${toDate}${args.dryRun ? ' (DRY RUN)' : ''}`);

    const projectKey = projectConfig.jira.projectKey;
    const summaryRows = [];

    for (const date of days) {
      const range = computeDayRange(date, tz);
      let actions, grouped, targets;

      try {
        actions = await collectActionsForRange({ range, projectConfig, jiraClient });
        grouped = groupActionsByActor(actions);
        targets = configUsers.length ? applyUserFilters(grouped, configUsers) : grouped;
      } catch (err) {
        logger.warn(`[${projectId}] ${date} — fetch error: ${err.message}`);
        continue;
      }

      const usersWithActions = targets.filter((e) => e.actions.length > 0);
      const row = { date, count: usersWithActions.length, users: usersWithActions.map((e) => e.actor.name) };
      summaryRows.push(row);

      if (!args.dryRun && usersWithActions.length > 0) {
        updateLastActionHistory(history, projectKey, targets, date);
      }

      const marker = usersWithActions.length > 0 ? '✓' : '·';
      const names = usersWithActions.length > 0 ? usersWithActions.map((e) => `${e.actor.name}(${e.actions.length})`).join(', ') : 'no activity';
      logger.info(`  ${marker} ${date}  ${names}`);

      totalDays++;
      totalActions += actions.length;
    }

    const activeDays = summaryRows.filter((r) => r.count > 0).length;
    logger.info(`[${projectId}] Done — ${activeDays}/${days.length} days had activity`);
  }

  if (!args.dryRun) {
    saveLastActionHistory(history);
    logger.info(`History saved. Total: ${totalDays} days processed, ${totalActions} raw actions.`);
  } else {
    logger.info(`Dry run complete. ${totalDays} days checked, ${totalActions} raw actions found.`);
  }
};

run().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Backfill failed');
  process.exit(1);
});
