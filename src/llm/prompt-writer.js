import fs from 'fs';
import path from 'path';

export const writePrompt = (actorName, prompt, { outputDir = 'output' } = {}) => {
  if (!prompt) return null;
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const nameStr = (typeof actorName === 'string' ? actorName : String(actorName || 'unknown'));
    const safeName = nameStr.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    const filePath = path.join(outputDir, `prompt-${safeName || 'unknown'}.txt`);
    fs.writeFileSync(filePath, prompt, 'utf8');
    return filePath;
  } catch (err) {
    console.error(`[PromptWriter] Failed to write prompt for user "${actorName}":`, err.message);
    return null;
  }
};
