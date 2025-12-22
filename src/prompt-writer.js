import fs from 'fs';
import path from 'path';

export const writePrompt = (actorName, prompt, { outputDir = 'output' } = {}) => {
  if (!prompt) return null;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const safeName = actorName.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const filePath = path.join(outputDir, `prompt-${safeName || 'unknown'}.txt`);
  fs.writeFileSync(filePath, prompt, 'utf8');
  return filePath;
};
