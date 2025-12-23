import fs from 'fs';
import path from 'path';
import { getAllUsersInProject } from './jira-client.js';

const matchUser = (entry, token) => {
  const norm = (v) => (v || '').toLowerCase();
  return norm(entry.actor?.name) === norm(token) || norm(entry.actor?.id) === norm(token);
};

export const applyUserFilters = (grouped, users) => {
  const include = users || [];
  return grouped.filter((entry) => {
    if (include.length && !include.some((t) => matchUser(entry, t))) {
      return false;
    }
    return true;
  });
};

export const writeActorList = async (grouped, projectConfig, jiraClient, outputDir = 'output') => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const seen = new Map();
  const mergeUser = (user) => {
    if (!user) return;
    const name = user.name || '';
    const id = user.id && user.id !== 'unknown' ? user.id : '';
    const email = user.email || '';
    const key = name ? name.toLowerCase() : id || null;
    if (!key) return;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { id, name, email });
    } else {
      if (!existing.email && email) existing.email = email;
      if (!existing.name && name) existing.name = name;
      if (!existing.id && id) existing.id = id;
    }
  };

  grouped.forEach((entry) => mergeUser(entry.actor));

  const allUsers = await getAllUsersInProject(projectConfig.jira.projectKey, jiraClient, projectConfig.maxConcurrency);
  allUsers.forEach((u) => mergeUser(u));

  const fileName = `actors-${projectConfig.jira.projectKey}.txt`;
  const filePath = path.join(outputDir, fileName);
  const lines = Array.from(seen.values())
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((info) => `${info.name || ''} | ${info.id || ''} | ${info.email || ''}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
};
