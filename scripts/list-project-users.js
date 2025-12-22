import fs from 'fs';
import path from 'path';
import { config } from '../src/config.js';
import { logger } from '../src/logger.js';
import { getAllUsersInProject } from '../src/jira-client.js';

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const run = async () => {
  const projectKey = config.jira.projectKey;
  logger.info(`Fetching users for project ${projectKey}`);

  const users = await getAllUsersInProject(projectKey);
  if (!users.length) {
    logger.warn('No users returned from Jira. Check permissions or project key.');
    return;
  }

  const outputDir = path.join(process.cwd(), 'output');
  ensureDir(outputDir);
  const filePath = path.join(outputDir, 'actors-query.txt');
  const sorted = users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const lines = sorted.map((u) => `${u.name || ''} | ${u.id || ''} | ${u.email || ''}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

  // Write ids only for quick config (one per line)
  const idPath = path.join(outputDir, 'actors-ids.txt');
  fs.writeFileSync(idPath, sorted.map((u) => u.id || '').filter(Boolean).join('\n'), 'utf8');

  logger.info(`Found ${users.length} users. Saved to ${filePath}`);
  console.log(lines.join('\n'));
};

run().catch((err) => {
  logger.error({ err: err.message }, 'Failed to fetch project users');
  process.exit(1);
});
