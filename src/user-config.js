import fs from 'fs';
import path from 'path';

export const loadUserConfig = (filePath = 'users.txt') => {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return null;
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  return lines
    .map((l) => l.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((name) => ({ name }));
};
