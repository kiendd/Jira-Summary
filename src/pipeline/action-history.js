import fs from 'fs';
import path from 'path';

const HISTORY_DIR = path.join(process.cwd(), 'output');
const HISTORY_FILE = path.join(HISTORY_DIR, 'last-actions.json');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
};

export const loadLastActionHistory = () => {
  const data = readJson(HISTORY_FILE);
  return data && typeof data === 'object' ? data : {};
};

export const saveLastActionHistory = (history) => {
  ensureDir(HISTORY_DIR);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

export const updateLastActionHistory = (history, projectKey, entries, dateLabel) => {
  const projectHistory = history[projectKey] && typeof history[projectKey] === 'object' ? history[projectKey] : {};
  (entries || []).forEach((entry) => {
    if (!entry?.actions?.length) return;
    const actorId = entry.actor?.id || entry.actor?.name;
    if (!actorId) return;
    const actorName = entry.actor?.name || '';
    const prevDate = projectHistory[actorId]?.lastActionDate;
    if (!prevDate || prevDate < dateLabel) {
      projectHistory[actorId] = { name: actorName, lastActionDate: dateLabel };
    }
  });
  history[projectKey] = projectHistory;
};

export const getLastActionDate = (history, projectKey, actorId, actorName) => {
  const projectHistory = history?.[projectKey];
  if (!projectHistory || typeof projectHistory !== 'object') return '';
  const direct = projectHistory[actorId]?.lastActionDate;
  if (direct) return direct;
  if (!actorName) return '';
  const match = Object.values(projectHistory).find((entry) => entry?.name && entry.name === actorName);
  return match?.lastActionDate || '';
};
