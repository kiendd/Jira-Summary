#!/usr/bin/env node
/**
 * Jira Summary Scheduler
 * Runs as a persistent process; triggers daily report at 20:00 on weekdays.
 * Friday: weekly report (--weekly), Mon–Thu: daily report.
 *
 * Usage:
 *   node scripts/scheduler.js
 *   npm run scheduler
 */
import { spawn } from 'child_process';
import { createWriteStream, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import cron from 'node-cron';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const TIMEZONE = 'Asia/Ho_Chi_Minh';

mkdirSync(LOG_DIR, { recursive: true });

const log = (msg) => {
  const ts = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd HH:mm:ss');
  process.stdout.write(`[${ts}] ${msg}\n`);
};

const rotateLogs = (keepDays = 30) => {
  try {
    const cutoff = DateTime.now().minus({ days: keepDays }).toFormat('yyyy-MM-dd');
    readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('run-') && f.endsWith('.log') && f.slice(4, 14) < cutoff)
      .forEach((f) => unlinkSync(join(LOG_DIR, f)));
  } catch { /* ignore */ }
};

const runReport = (args = []) => {
  const dateStr = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd');
  const logFile = join(LOG_DIR, `run-${dateStr}.log`);
  const logStream = createWriteStream(logFile, { flags: 'a' });

  const label = args.includes('--weekly') ? 'weekly' : 'daily';
  log(`Starting ${label} report...`);
  logStream.write(`=== ${DateTime.now().setZone(TIMEZONE).toISO()} START (${label}) ===\n`);

  const child = spawn('node', ['src/index.js', ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  child.on('close', (code) => {
    logStream.write(`=== ${DateTime.now().setZone(TIMEZONE).toISO()} END (exit: ${code}) ===\n`);
    logStream.end();
    if (code === 0) {
      log(`Report finished successfully.`);
    } else {
      log(`Report exited with code ${code}. See ${logFile}`);
    }
  });
};

const trigger = () => {
  rotateLogs();
  runReport();
};

// Schedule: 20:00 Mon–Fri, timezone GMT+7
cron.schedule('0 20 * * 1-5', trigger, { timezone: TIMEZONE });

log(`Scheduler started. Next run: weekdays at 20:00 ${TIMEZONE}`);
log(`Logs will be saved to: ${LOG_DIR}`);
