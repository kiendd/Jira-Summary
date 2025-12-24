import { DateTime } from 'luxon';
import { logger } from './logger.js';
import { truncate, sanitizeIssueSummary } from './utils.js';
import { buildLocalSummary } from './summary-builder.js';
import { writePrompt } from './prompt-writer.js';
import { loadTemplate } from './prompt-loader.js';

const buildPrompt = (actorBlock, dateLabel, projectConfig) => {
  const tmpl = loadTemplate('user');
  const lines = actorBlock.actions
    .map((action) => {
      const atLocal = DateTime.fromISO(action.at || action.details?.startedLocal, { zone: 'utc' })
        .setZone(projectConfig.timezone)
        .toFormat('HH:mm');
      const summary = sanitizeIssueSummary(action.issueSummary);
      if (action.type === 'status-change') {
        return `- [${atLocal}] ${action.issueKey} status ${action.details.from} -> ${action.details.to}${
          summary ? ` | ${summary}` : ''
        }`;
      }
      if (action.type === 'comment') {
        return `- [${atLocal}] comment ${action.issueKey}: ${truncate(action.details.excerpt, 160)}`;
      }
      if (action.type === 'worklog') {
        const mins = Math.round((action.details.timeSpentSeconds || 0) / 60);
        return `- [${atLocal}] worklog ${mins}m ${action.issueKey}${summary ? `: ${summary}` : ''}`;
      }
      if (action.type === 'created') {
        const status = action.details.status || '';
        const title = summary ? ` (${summary})` : '';
        const statusPart = status ? ` status ${status}` : '';
        return `- [${atLocal}] created ${action.issueKey}${title}${statusPart}`;
      }
      return `- [${atLocal}] ${action.type} ${action.issueKey}${summary ? `: ${summary}` : ''}`;
    })
    .join('\n');
  return tmpl
    .replace(/{{DATE}}/g, dateLabel)
    .replace(/{{TIMEZONE}}/g, projectConfig.timezone)
    .replace(/{{USER_NAME}}/g, actorBlock.actor.name || '')
    .replace(/{{PROJECT_KEY}}/g, projectConfig.jira.projectKey || '')
    .replace(/{{ACTION_LINES}}/g, lines);
};

const buildBody = (url, prompt, projectConfig) => {
  const isChat = url.includes('/chat/completions');
  if (isChat) {
    return {
      model: projectConfig.lmx.model || undefined,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };
  }
  return {
    model: projectConfig.lmx.model || undefined,
    prompt,
    stream: false,
  };
};

const extractSummary = (data) => {
  if (!data) return '';
  if (data.summary || data.result || data.text || data.output) {
    return data.summary || data.result || data.text || data.output;
  }
  if (Array.isArray(data.choices) && data.choices.length) {
    const choice = data.choices[0];
    if (choice.message?.content) return choice.message.content;
    if (choice.text) return choice.text;
  }
  return '';
};

const tryCallLmx = async (url, prompt, projectConfig) => {
  const body = buildBody(url, prompt, projectConfig);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LMX responded with status ${res.status}`);
  }
  const data = await res.json();
  const summary = extractSummary(data);
  if (!summary) throw new Error('Missing summary field in LMX response');
  return String(summary).trim();
};

export const summarizeWithXlm = async (actorBlock, dateLabel, projectConfig, { requireXlm } = {}) => {
  const prompt = buildPrompt(actorBlock, dateLabel, projectConfig);
  writePrompt(actorBlock.actor.name, prompt);
  const base = projectConfig.lmx.baseUrl;
  const urls = [
    `${base}${projectConfig.lmx.path}`,
    `${base}/v1/chat/completions`,
    `${base}/v1/completions`,
  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

  let lastErr = null;
  for (const url of urls) {
    try {
      const result = await tryCallLmx(url, prompt, projectConfig);
      logger.info({ url }, 'LMX summarize succeeded');
      return result;
    } catch (err) {
      lastErr = err;
      logger.warn({ err: err.message, url }, 'LMX summarize failed on endpoint');
    }
  }

  if (requireXlm) {
    throw lastErr || new Error('LMX summary required but no endpoint succeeded');
  }

  logger.info('LMX unavailable, using local summary fallback');
  return buildLocalSummary(actorBlock);
};
