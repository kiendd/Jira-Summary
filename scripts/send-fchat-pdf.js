import path from 'path';
import { config } from '../src/config.js';
import { logger } from '../src/logger.js';
import { sendFchatReport } from '../src/fchat-client.js';

const run = async () => {
  if (!config.fchat.enabled) {
    logger.warn('FChat is disabled. Set FCHAT_ENABLED=true in .env.');
    return;
  }
  if (!config.fchat.groupId || !config.fchat.token) {
    logger.warn('Missing FCHAT_GROUP_ID or FCHAT_TOKEN.');
    return;
  }

  const pdfPath = path.join(process.cwd(), 'output', 'summary-DC5FC-2025-12-22.pdf');
  logger.info(`Sending PDF: ${pdfPath}`);
  await sendFchatReport({
    projectKey: 'DC5FC',
    dateLabel: '2025-12-22',
    targets: [],
    summaries: new Map(),
    pdfPath,
  });
};

run().catch((err) => {
  logger.error({ err: err.message }, 'Failed to send FChat PDF');
  process.exit(1);
});
