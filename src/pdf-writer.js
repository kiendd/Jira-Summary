import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { secondsToHhmm, sanitizeIssueSummary } from './utils.js';

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const FONT_REGULAR = path.join(process.cwd(), 'fonts', 'NotoSans-Regular.ttf');
const FONT_BOLD = path.join(process.cwd(), 'fonts', 'NotoSans-Bold.ttf');
const ISSUE_KEY_PATTERN = /(\b[A-Z][A-Z0-9]+-\d+\b)/g;

const formatList = (items, limit = 6) => {
  if (!items?.length) return '';
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest} more` : shown.join(', ');
};

const buildStatusChain = (transitions) => {
  if (!transitions?.length) return '';
  const sorted = [...transitions].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const chain = [];
  for (const t of sorted) {
    const from = t.from || '';
    const to = t.to || '';
    if (!chain.length && from) chain.push(from);
    if (to) {
      const last = chain[chain.length - 1];
      if (to !== last) chain.push(to);
    }
  }
  const uniq = chain.filter(Boolean);
  if (!uniq.length) return '';
  const steps = uniq.length > 1 ? ` (${uniq.length - 1} steps)` : '';
  return `${uniq.join(' -> ')}${steps}`;
};

const buildSegments = (text, issueLinks) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/).filter((p) => p.length > 0);
  const segments = [];

  parts.forEach((part) => {
    const isBold = part.startsWith('**') && part.endsWith('**');
    const content = isBold ? part.slice(2, -2) : part;
    const tokens = content.split(ISSUE_KEY_PATTERN).filter((t) => t.length > 0);
    tokens.forEach((token) => {
      const link = issueLinks?.get(token);
      segments.push({ text: token, bold: isBold, link });
    });
  });

  return segments;
};

const renderInlineSegments = (doc, segments, { indent = 0 } = {}) => {
  if (!segments.length) {
    doc.text('', { indent });
    return;
  }
  segments.forEach((segment, idx) => {
    const isLast = idx === segments.length - 1;
    const isLink = Boolean(segment.link || segment.goTo);
    const options = {
      continued: !isLast,
    };
    if (idx === 0 && indent) {
      options.indent = indent;
    }
    if (segment.link) {
      options.link = segment.link;
      options.goTo = null;
    } else if (segment.goTo) {
      options.goTo = segment.goTo;
      options.link = null;
    } else {
      // PDFKit carries continued text options forward unless explicitly cleared.
      options.link = null;
      options.goTo = null;
    }
    options.underline = isLink;
    const beforeCount = (doc.page.annotations || []).length;
    doc.fillColor(isLink ? 'blue' : 'black').text(segment.text, options);
    if (segment.link) {
      const annots = doc.page.annotations || [];
      const newAnnots = annots.slice(beforeCount);
      newAnnots.forEach((ref) => {
        if (!ref?.data) return;
        const action = ref.data.A;
        if (action?.data) {
          action.data.NewWindow = true;
          if (!action.data.URI) action.data.URI = new String(segment.link);
        } else if (action) {
          action.NewWindow = true;
          if (!action.URI) action.URI = new String(segment.link);
        } else {
          ref.data.A = {
            S: 'URI',
            URI: new String(segment.link),
            NewWindow: true,
          };
        }
      });
    }
  });
  doc.fillColor('black');
  doc.text('', { indent });
};

const buildIssueActivity = (grouped) => {
  const byIssue = new Map();
  grouped.forEach((entry) => {
    const actorId = entry.actor?.id || entry.actor?.name || 'unknown';
    const actorName = entry.actor?.name || actorId;
    (entry.actions || []).forEach((action) => {
      const key = action.issueKey;
      if (!key) return;
      if (!byIssue.has(key)) {
        byIssue.set(key, {
          key,
          summary: sanitizeIssueSummary(action.issueSummary),
          actorIds: new Set(),
          actorNames: new Set(),
          actionCount: 0,
          typeCounts: { created: 0, status: 0, comments: 0, worklogs: 0, other: 0 },
          transitions: [],
          createdStatus: '',
        });
      }
      const item = byIssue.get(key);
      if (!item.summary) {
        item.summary = sanitizeIssueSummary(action.issueSummary);
      }
      item.actorIds.add(actorId);
      if (actorName) item.actorNames.add(actorName);
      item.actionCount += 1;
      if (action.type === 'created') {
        item.typeCounts.created += 1;
        if (!item.createdStatus && action.details?.status) {
          item.createdStatus = action.details.status;
        }
      } else if (action.type === 'status-change') {
        item.typeCounts.status += 1;
        item.transitions.push({
          from: action.details?.from,
          to: action.details?.to,
          at: action.at,
        });
      } else if (action.type === 'comment') {
        item.typeCounts.comments += 1;
      } else if (action.type === 'worklog') {
        item.typeCounts.worklogs += 1;
      } else {
        item.typeCounts.other += 1;
      }
    });
  });

  return Array.from(byIssue.values())
    .map((it) => ({
      key: it.key,
      summary: it.summary,
      actorCount: it.actorIds.size,
      actorNames: Array.from(it.actorNames).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      actionCount: it.actionCount,
      typeCounts: it.typeCounts,
      transitions: it.transitions,
      createdStatus: it.createdStatus,
    }))
    .sort((a, b) => {
      if (b.actorCount !== a.actorCount) return b.actorCount - a.actorCount;
      if (b.actionCount !== a.actionCount) return b.actionCount - a.actionCount;
      return a.key.localeCompare(b.key);
    })
    .slice(0, 10);
};

const addIssueActivitySummary = (doc, grouped, issueLinks) => {
  const items = buildIssueActivity(grouped);
  if (!items.length) return;
  doc.font(FONT_BOLD).fontSize(12).text('Top Issues Today');
  doc.moveDown(0.3);
  doc.font(FONT_REGULAR).fontSize(11);
  items.forEach((item) => {
    const summaryPart = item.summary ? `: ${item.summary}` : '';
    const statsPart = ` (actors: ${item.actorCount}, actions: ${item.actionCount})`;
    renderFormattedLine(doc, `${item.key}${summaryPart}${statsPart}`, {
      bullet: true,
      issueLinks,
    });
    const actorsLabel = formatList(item.actorNames, 6);
    if (actorsLabel) {
      renderFormattedLine(doc, `Actors: ${actorsLabel}`, { bullet: true, indent: 30, issueLinks: null });
    }
    const breakdown = [];
    if (item.typeCounts.created) breakdown.push(`created ${item.typeCounts.created}`);
    if (item.typeCounts.status) breakdown.push(`status ${item.typeCounts.status}`);
    if (item.typeCounts.comments) breakdown.push(`comments ${item.typeCounts.comments}`);
    if (item.typeCounts.worklogs) breakdown.push(`worklogs ${item.typeCounts.worklogs}`);
    if (item.typeCounts.other) breakdown.push(`other ${item.typeCounts.other}`);
    if (breakdown.length) {
      renderFormattedLine(doc, `Action breakdown: ${breakdown.join(', ')}`, {
        bullet: true,
        indent: 30,
        issueLinks: null,
      });
    }
    const statusChain = buildStatusChain(item.transitions);
    if (statusChain) {
      renderFormattedLine(doc, `Status changes: ${statusChain}`, {
        bullet: true,
        indent: 30,
        issueLinks: null,
      });
    } else if (item.createdStatus) {
      renderFormattedLine(doc, `Created status: ${item.createdStatus}`, {
        bullet: true,
        indent: 30,
        issueLinks: null,
      });
    }
  });
  doc.moveDown(1);
};

const renderFormattedLine = (doc, text, { bullet = false, indent = 0, issueLinks } = {}) => {
  const lineIndent = bullet ? (indent || 15) : indent;
  const segments = buildSegments(text, issueLinks);
  if (bullet) {
    doc.font(FONT_REGULAR).fillColor('black').text('• ', { continued: true, indent: lineIndent });
  }

  if (!segments.length) {
    doc.text('', { indent: lineIndent });
    return;
  }

  segments.forEach((segment) => {
    segment.font = segment.bold ? FONT_BOLD : FONT_REGULAR;
  });

  let firstSegment = true;
  segments.forEach((segment, idx) => {
    const isLast = idx === segments.length - 1;
    const options = {
      continued: !isLast,
    };
    if (firstSegment && indent) {
      options.indent = lineIndent;
    }
    if (segment.link) {
      options.link = segment.link;
      options.underline = true;
    } else {
      options.link = null;
      options.underline = false;
    }
    options.goTo = null;

    const beforeCount = (doc.page.annotations || []).length;
    doc.font(segment.font).fillColor(segment.link ? 'blue' : 'black').text(segment.text, options);
    firstSegment = false;

    if (segment.link) {
      const annots = doc.page.annotations || [];
      const newAnnots = annots.slice(beforeCount);
      newAnnots.forEach((ref) => {
        if (!ref?.data) return;
        const action = ref.data.A;
        if (action?.data) {
          action.data.NewWindow = true;
          if (!action.data.URI) action.data.URI = new String(segment.link);
        } else if (action) {
          action.NewWindow = true;
          if (!action.URI) action.URI = new String(segment.link);
        } else {
          ref.data.A = {
            S: 'URI',
            URI: new String(segment.link),
            NewWindow: true,
          };
        }
      });
    }
  });
  doc.fillColor('black');
  doc.text('', { indent: lineIndent });
};

const renderRichText = (doc, summaryText, issueLinks) => {
  const lines = (summaryText || '').split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    const leadingSpaces = line.length - line.trimStart().length;
    if (!trimmed) {
      doc.moveDown(0.2);
      return;
    }
    if (trimmed.startsWith('- ')) {
      const level = Math.floor(leadingSpaces / 2);
      const indent = 15 * (level + 1);
      renderFormattedLine(doc, trimmed.slice(2), { bullet: true, indent, issueLinks });
    } else {
      renderFormattedLine(doc, trimmed, { bullet: false, indent: 0, issueLinks });
    }
  });
};

const addHeader = (doc, projectKey, projectName, dateLabel, timezone, warnings) => {
  const projectLabel = projectName ? `${projectKey} (${projectName})` : projectKey;
  doc.font(FONT_BOLD).fontSize(20).text(`Jira Summary - ${projectLabel}`, { align: 'left' });
  doc.moveDown(0.5);
  doc.font(FONT_REGULAR).fontSize(12).text(`Date: ${dateLabel} (Timezone: ${timezone})`);
  doc.moveDown(0.5);
  doc.text(`Generated at: ${new Date().toISOString()}`);
  if (warnings && warnings.length) {
    doc.moveDown(0.5);
    doc.fillColor('red').font(FONT_BOLD).fontSize(12).text('Warnings:');
    doc.moveDown(0.2);
    doc.font(FONT_REGULAR).fontSize(11);
    warnings.forEach((w) => doc.text(`- ${w}`));
    doc.fillColor('black');
  }
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

const addActorSection = (doc, entry, summaryText, trackingText, issueLinks, statsLinks, commentInfo) => {
  doc.addNamedDestination(entry.actor.id, 'XYZ', doc.x, doc.y, null);
  doc.font(FONT_BOLD).fontSize(14).text(entry.actor.name, { underline: true });
  doc.moveDown(0.2);

  const stats = entry.stats;
  const workTime = secondsToHhmm(stats.worklogSeconds);
  doc.font(FONT_BOLD).fontSize(12).text('Summary');
  doc.moveDown(0.2);
  const createdLink = statsLinks?.created || {};
  const statusLink = statsLinks?.status || {};
  const commentLink = statsLinks?.comments || {};
  const worklogLink = statsLinks?.worklogs || {};
  const segments = [
    { text: 'Stats: created ' },
    { text: String(stats.created), link: createdLink.link, goTo: createdLink.goTo },
    { text: ', status ' },
    { text: String(stats.status), link: statusLink.link, goTo: statusLink.goTo },
    { text: ', comments ' },
    { text: String(stats.comments), link: commentLink.link, goTo: commentLink.goTo },
    { text: ', worklogs ' },
    { text: String(stats.worklogs), link: worklogLink.link, goTo: worklogLink.goTo },
    { text: `, time ${workTime}` },
  ];
  doc.font(FONT_REGULAR).fontSize(11);
  renderInlineSegments(doc, segments);
  doc.moveDown(0.2);

  doc.font(FONT_REGULAR).fontSize(11);
  renderRichText(doc, summaryText || 'No summary available.', issueLinks);
  doc.moveDown(0.6);

  if (trackingText) {
    doc.font(FONT_BOLD).fontSize(12).text('Issue Update Details');
    doc.moveDown(0.2);
    doc.font(FONT_REGULAR).fontSize(11);
    renderRichText(doc, trackingText, issueLinks);
  }

  doc.moveDown(1);
};

export const writePdfReport = async ({
  dateLabel,
  projectKey,
  projectName = '',
  timezone,
  grouped,
  summaries,
  trackings,
  statsLinks = new Map(),
  commentDetails = new Map(),
  issueLinks = new Map(),
  outputDir = 'output',
  warnings = [],
}) => {
  ensureDir(outputDir);
  const fileName = `summary-${projectKey}-${dateLabel}.pdf`;
  const filePath = path.join(outputDir, fileName);

  const doc = new PDFDocument({ autoFirstPage: true, margin: 50 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  addHeader(doc, projectKey, projectName, dateLabel, timezone, warnings);
  addMenu(doc, grouped);
  addIssueActivitySummary(doc, grouped, issueLinks);

  grouped.forEach((entry, idx) => {
    if (idx > 0 && doc.y > doc.page.height - 200) {
      doc.addPage();
    }
    const summaryText = summaries.get(entry.actor.id) || '';
    const trackingText = trackings.get(entry.actor.id) || '';
    const perActorStatsLinks = statsLinks.get(entry.actor.id);
    const perActorComments = commentDetails.get(entry.actor.id);
    addActorSection(doc, entry, summaryText, trackingText, issueLinks, perActorStatsLinks, perActorComments);
  });

  return await new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', (err) => reject(err));
    doc.end();
  });
};
