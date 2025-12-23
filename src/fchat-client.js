import path from 'path';
import { createRequire } from 'module';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);

const formatTotals = (stats) =>
  `🆕 ${stats.created} · 🔄 ${stats.status} · 💬 ${stats.comments} · ⏱️ ${stats.worklogs}`;

const buildMessage = ({ targets }) => {
  const noActions = [];
  const hasActions = [];

  targets.forEach((entry) => {
    const totals = formatTotals(entry.stats || { created: 0, status: 0, comments: 0, worklogs: 0 });
    const line = `- ${entry.actor.name}: ${totals}`;
    if (entry.actions?.length) {
      hasActions.push(line);
    } else {
      noActions.push(`- ${entry.actor.name}`);
    }
  });

  const parts = [
    noActions.length ? `No actions:\n${noActions.join('\n')}` : '',
    hasActions.length ? `\nHas actions:\n${hasActions.join('\n')}` : '',
  ];
  return parts.filter(Boolean).join('\n');
};

export const sendFchatReport = async ({ projectConfig, dateLabel, targets, pdfPath }) => {
  const { fchat } = projectConfig;
  if (!fchat.enabled) return;
  if (!fchat.token || !fchat.groupId) {
    logger.warn('FChat enabled but missing FCHAT_TOKEN or FCHAT_GROUP_ID');
    return;
  }

  const { FChatBot } = require('fchat-bot-api');
  const bot = new FChatBot(fchat.token, {
    baseURL: fchat.baseUrl || FChatBot.prodBaseUrl(),
    timeoutMs: fchat.timeoutMs,
  });

  if (fchat.sendText) {
    const [year, month, day] = dateLabel.split('-');
    const formatted = day && month && year ? `${day}/${month}/${year}` : dateLabel;
    const template = fchat.headerTemplate || 'Con gửi tổng hợp action trên JIRA ngày {date}';
    const header = template.replace(/\{date\}/g, formatted);
    const body = buildMessage({ targets });
    const message = body ? `${header}\n\n${body}` : header;
    try {
      await bot.sendMessage(fchat.groupId, message);
      logger.info('FChat text message sent');
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to send FChat text message');
    }
  }

  if (fchat.sendPdf && pdfPath) {
    try {
      const absPath = path.isAbsolute(pdfPath) ? pdfPath : path.join(process.cwd(), pdfPath);
      await bot.sendFile(fchat.groupId, absPath);
      logger.info('FChat PDF sent');
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to send FChat PDF');
    }
  }
};
