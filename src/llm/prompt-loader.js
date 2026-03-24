import fs from 'fs';
import path from 'path';

const cache = new Map();

const templatePath = (name) =>
  path.join(process.cwd(), 'prompt-templates', `${name}.txt`);

export const loadTemplate = (name) => {
  if (cache.has(name)) return cache.get(name);
  const filePath = templatePath(name);
  const content = fs.readFileSync(filePath, 'utf8');
  cache.set(name, content);
  return content;
};
