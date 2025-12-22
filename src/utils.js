import { config } from './config.js';

export const truncate = (text, max = 140) => {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

export const buildIssueUrl = (issueKey) => `${config.jira.baseUrl}/browse/${issueKey}`;

export const secondsToHhmm = (seconds) => {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs && mins) return `${hrs}h${mins}m`;
  if (hrs) return `${hrs}h`;
  return `${mins}m`;
};
