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

const renderFormattedLine = (doc, text, { bullet = false } = {}) => {
  const indent = bullet ? 15 : 0;
  if (bullet) {
    doc.text('• ', { continued: true, indent });
  }
  const parts = text.split(/(\*\*[^*]+\*\*)/).filter((p) => p.length > 0);
  parts.forEach((part, idx) => {
    const isBold = part.startsWith('**') && part.endsWith('**');
    const content = isBold ? part.slice(2, -2) : part;
    doc.font(isBold ? FONT_BOLD : FONT_REGULAR).text(content, {
      continued: idx < parts.length - 1,
      indent,
    });
  });
  doc.text('', { indent });
};

const renderRichText = (doc, summaryText) => {
  const lines = (summaryText || '').split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      doc.moveDown(0.2);
      return;
    }
    if (trimmed.startsWith('- ')) {
      renderFormattedLine(doc, trimmed.slice(2), { bullet: true });
    } else {
      renderFormattedLine(doc, trimmed, { bullet: false });
    }
  });
};

const addHeader = (doc, projectKey, dateLabel) => {
  doc.font(FONT_BOLD).fontSize(20).text(`Jira Summary - ${projectKey}`, { align: 'left' });
  doc.moveDown(0.5);
  doc.font(FONT_REGULAR).fontSize(12).text(`Date: ${dateLabel} (Timezone: ${config.timezone})`);
  doc.moveDown(0.5);
  doc.text(`Generated at: ${new Date().toISOString()}`);
  doc.moveDown(1);
};

const addMenu = (doc, grouped) => {
  doc.font(FONT_BOLD).fontSize(12).text('Users', { underline: true });
  doc.moveDown(0.3);
  doc.font(FONT_REGULAR).fontSize(11);
  grouped.forEach((entry) => {
    doc.text(`- ${entry.actor.name} (${entry.actions.length} actions)`, {
      goTo: entry.actor.id,
      link: undefined,
      underline: true,
    });
  });
  doc.moveDown(1);
};

const addActorSection = (doc, entry, summaryText, trackingText) => {
  doc.addNamedDestination(entry.actor.id);
  doc.font(FONT_BOLD).fontSize(14).text(entry.actor.name, { underline: true });
  doc.moveDown(0.2);

  const stats = entry.stats;
  const workTime = secondsToHhmm(stats.worklogSeconds);
  doc.font(FONT_BOLD).fontSize(12).text('Tổng hợp');
  doc.moveDown(0.2);
  doc.font(FONT_REGULAR).fontSize(11).text(
    `Stats: created ${stats.created}, status ${stats.status}, comments ${stats.comments}, worklogs ${stats.worklogs}, time ${workTime}`
  );
  doc.moveDown(0.2);

  doc.font(FONT_REGULAR).fontSize(11);
  renderRichText(doc, summaryText || 'No summary');
  doc.moveDown(0.6);

  if (trackingText) {
    doc.font(FONT_BOLD).fontSize(12).text('Chi tiết trạng thái theo issue');
    doc.moveDown(0.2);
    doc.font(FONT_REGULAR).fontSize(11);
    renderRichText(doc, trackingText);
  }
  doc.moveDown(1);
};

export const writePdfReport = ({ dateLabel, projectKey, grouped, summaries, trackings, outputDir = 'output' }) => {
  ensureDir(outputDir);
  const fileName = `summary-${projectKey}-${dateLabel}.pdf`;
  const filePath = path.join(outputDir, fileName);

  const doc = new PDFDocument({ autoFirstPage: true, margin: 50 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  addHeader(doc, projectKey, dateLabel);
  addMenu(doc, grouped);

  grouped.forEach((entry, idx) => {
    if (idx > 0 && doc.y > doc.page.height - 200) {
      doc.addPage();
    }
    const summaryText = summaries.get(entry.actor.id) || '';
    const trackingText = trackings.get(entry.actor.id) || '';
    addActorSection(doc, entry, summaryText, trackingText);
  });

  doc.end();

  return filePath;
};
