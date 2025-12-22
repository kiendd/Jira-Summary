import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { secondsToHhmm } from './utils.js';
import { config } from './config.js';

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const FONT_REGULAR = path.join(process.cwd(), 'fonts', 'NotoSans-Regular.ttf');
const FONT_BOLD = path.join(process.cwd(), 'fonts', 'NotoSans-Bold.ttf');

const addHeader = (doc, projectKey, dateLabel) => {
  doc.font(FONT_BOLD).fontSize(20).text(`Jira Summary - ${projectKey}`, { align: 'left' });
  doc.moveDown(0.5);
  doc.font(FONT_REGULAR).fontSize(12).text(`Date: ${dateLabel} (Timezone: ${config.timezone})`);
  doc.moveDown(0.5);
  doc.text(`Generated at: ${new Date().toISOString()}`);
  doc.moveDown(1);
};

const addActorSection = (doc, entry, summaryText) => {
  doc.font(FONT_BOLD).fontSize(14).text(entry.actor.name, { underline: true });
  doc.moveDown(0.2);

  const stats = entry.stats;
  const workTime = secondsToHhmm(stats.worklogSeconds);
  doc.font(FONT_REGULAR).fontSize(11).text(
    `Stats: created ${stats.created}, status ${stats.status}, comments ${stats.comments}, worklogs ${stats.worklogs}, time ${workTime}`
  );
  doc.moveDown(0.4);

  doc.font(FONT_REGULAR).fontSize(11).text(summaryText || 'No summary', { width: 500 });
  doc.moveDown(1);
};

export const writePdfReport = ({ dateLabel, projectKey, grouped, summaries, outputDir = 'output' }) => {
  ensureDir(outputDir);
  const fileName = `summary-${projectKey}-${dateLabel}.pdf`;
  const filePath = path.join(outputDir, fileName);

  const doc = new PDFDocument({ autoFirstPage: true, margin: 50 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  addHeader(doc, projectKey, dateLabel);

  grouped.forEach((entry, idx) => {
    if (idx > 0 && doc.y > doc.page.height - 200) {
      doc.addPage();
    }
    const summaryText = summaries.get(entry.actor.id) || '';
    addActorSection(doc, entry, summaryText);
  });

  doc.end();

  return filePath;
};
