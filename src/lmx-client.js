import { DateTime } from 'luxon';
import { config } from './config.js';
import { logger } from './logger.js';
import { truncate } from './utils.js';
import { buildLocalSummary } from './summary-builder.js';

const buildPrompt = (actorBlock, dateLabel) => {
  const header = `Tóm tắt hành động Jira cho ${actorBlock.actor.name} trong ngày ${dateLabel} (múi giờ GMT+7). Trả lời 3-6 bullet ngắn gọn, đủ thông tin (issue key, tiêu đề/nội dung ngắn, kết quả, trạng thái, thời gian nếu quan trọng). Ưu tiên kết quả hoàn thành/đang chặn, tránh lặp lại.`;
  const lines = actorBlock.actions
    .map((action) => {
      const atLocal = DateTime.fromISO(action.at || action.details?.startedLocal, { zone: 'utc' })
        .setZone(config.timezone)
        .toFormat('HH:mm');
      const desc = action.issueDescription ? ` — ${truncate(action.issueDescription, 120)}` : '';
      if (action.type === 'status-change') {
        return `- [${atLocal}] ${action.issueKey} ${action.details.from} -> ${action.details.to} | ${action.issueSummary}${desc}`;
      }
      if (action.type === 'comment') {
        return `- [${atLocal}] comment ${action.issueKey}: ${truncate(action.details.excerpt, 160)}${desc}`;
      }
      if (action.type === 'worklog') {
        const mins = Math.round((action.details.timeSpentSeconds || 0) / 60);
        return `- [${atLocal}] worklog ${mins}m ${action.issueKey}: ${action.issueSummary}${desc}`;
      }
      if (action.type === 'created') {
        return `- [${atLocal}] created ${action.issueKey} (${action.issueSummary}) status ${action.details.status || ''}${desc}`;
      }
      return `- [${atLocal}] ${action.type} ${action.issueKey}: ${action.issueSummary}${desc}`;
    })
    .join('\n');
  return `${header}\n${lines}\nKết thúc bằng bullet tổng quan số lượng (issue tạo, chuyển trạng thái, comment, worklog).`;
};

const buildBody = (url, prompt) => {
  const isChat = url.includes('/chat/completions');
  if (isChat) {
    return {
      model: config.lmx.model || undefined,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };
  }
  return {
    model: config.lmx.model || undefined,
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

const tryCallLmx = async (url, prompt) => {
  const body = buildBody(url, prompt);
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

export const summarizeWithXlm = async (actorBlock, dateLabel, { requireXlm } = {}) => {
  const prompt = buildPrompt(actorBlock, dateLabel);
  const base = config.lmx.baseUrl;
  const urls = [
    `${base}${config.lmx.path}`,
    `${base}/v1/chat/completions`,
    `${base}/v1/completions`,
  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

  let lastErr = null;
  for (const url of urls) {
    try {
      const result = await tryCallLmx(url, prompt);
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
