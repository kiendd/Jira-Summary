import fs from 'fs';
import path from 'path';
import { config } from './config.js';

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

export const writeActorList = (grouped, outputDir = 'output') => {
  if (!grouped.length) return null;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filePath = path.join(outputDir, 'actors.txt');
  const lines = grouped.map((entry) => `${entry.actor.name || 'Unknown'} | ${entry.actor.id || ''}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
};
