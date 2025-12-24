export const truncate = (text, max = 140) => {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

export const sanitizeIssueSummary = (summary) => {
  if (!summary) return '';
  if (CJK_PATTERN.test(summary)) return '';
  return summary;
};

export const buildIssueUrl = (issueKey, jiraBaseUrl) => `${jiraBaseUrl}/browse/${issueKey}`;

export const buildCommentUrl = (issueKey, commentId, jiraBaseUrl) => {
  if (!issueKey || !commentId) return '';
  const tab = 'page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel';
  const focus = `focusedCommentId=${commentId}`;
  return `${jiraBaseUrl}/browse/${issueKey}?${tab}&${focus}#comment-${commentId}`;
};

export const buildIssueSearchUrl = (issueKeys, jiraBaseUrl) => {
  if (!issueKeys?.length) return '';
  const list = issueKeys.filter(Boolean);
  if (!list.length) return '';
  const jql = `key in (${list.join(',')}) order by key`;
  return `${jiraBaseUrl}/issues/?jql=${encodeURIComponent(jql)}`;
};

export const secondsToHhmm = (seconds) => {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs && mins) return `${hrs}h${mins}m`;
  if (hrs) return `${hrs}h`;
  return `${mins}m`;
};
