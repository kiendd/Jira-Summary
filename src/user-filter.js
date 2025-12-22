import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { getAllUsersInProject } from './jira-client.js';

const matchUser = (entry, token) => {
  const norm = (v) => (v || '').toLowerCase();
  return norm(entry.actor?.name) === norm(token) || norm(entry.actor?.id) === norm(token);
};

export const applyUserFilters = (grouped) => {
  const include = config.filters.includeUsers;
  const exclude = config.filters.excludeUsers;
  return grouped.filter((entry) => {
    if (include.length && !include.some((t) => matchUser(entry, t))) {
      return false;
    }
    if (exclude.length && exclude.some((t) => matchUser(entry, t))) {
      return false;
    }
    return true;
  });
};

export const writeActorList = async (grouped, outputDir = 'output') => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const seen = new Map();
  grouped.forEach((entry) => {
    if (entry.actor?.id) {
      seen.set(entry.actor.id, { name: entry.actor.name || entry.actor.id, email: entry.actor.email || '' });
    }
  });

  const allUsers = await getAllUsersInProject(config.jira.projectKey);
  allUsers.forEach((u) => {
    if (!seen.has(u.id)) {
      seen.set(u.id, { name: u.name, email: u.email || '' });
    }
  });

  const filePath = path.join(outputDir, 'actors.txt');
  const lines = Array.from(seen.entries())
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, info]) => `${info.name} | ${id} | ${info.email || ''}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
};
