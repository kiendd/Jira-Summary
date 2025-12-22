import { DateTime } from 'luxon';
import { config } from './config.js';

const actionLine = (action) => {
  const atLocal = DateTime.fromISO(action.at || action.details?.startedLocal, { zone: 'utc' })
    .setZone(config.timezone)
    .toFormat('HH:mm');
  if (action.type === 'status-change') {
    return `- [${atLocal}] ${action.issueKey} ${action.details.from} -> ${action.details.to} | ${action.issueSummary}`;
  }
  if (action.type === 'comment') {
    return `- [${atLocal}] comment ${action.issueKey}: ${action.details.excerpt ?? ''}`;
  }
  if (action.type === 'worklog') {
    const mins = Math.round((action.details.timeSpentSeconds || 0) / 60);
    return `- [${atLocal}] worklog ${mins}m ${action.issueKey}: ${action.issueSummary}`;
  }
  if (action.type === 'created') {
    return `- [${atLocal}] created ${action.issueKey} (${action.issueSummary}) status ${action.details.status || ''}`;
  }
  return `- [${atLocal}] ${action.type} ${action.issueKey}: ${action.issueSummary}`;
};

export const buildGlobalPrompt = (grouped, dateLabel) => {
  const header = `Tóm tắt hành động Jira trong ngày ${dateLabel} (múi giờ GMT+7) cho tất cả thành viên. Với mỗi người, trả lời 3-6 bullet ngắn gọn (issue key + tiêu đề, kết quả, trạng thái, thời gian nếu quan trọng). Ưu tiên kết quả hoàn thành/đang chặn, tránh lặp lại.`;
  const body = grouped
    .map((entry) => {
      const lines = entry.actions.map(actionLine).join('\n');
      return `\n## ${entry.actor.name}\n${lines}`;
    })
    .join('\n');
  return `${header}\n${body}\nKết thúc mỗi người bằng bullet tổng quan số lượng (issue tạo, chuyển trạng thái, comment, worklog).`;
};
