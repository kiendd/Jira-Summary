import dotenv from 'dotenv';

dotenv.config();

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var ${key}`);
  }
  return value.trim();
};

const optionalEnv = (key, fallback) => {
  const value = process.env[key];
  return value ? value.trim() : fallback;
};

const parseBool = (value) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
};
const parseList = (value) =>
  value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
const parseIntEnv = (value, fallback) => {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeBaseUrl = (url) => url.replace(/\/+$/, '');

const authTypeRaw = optionalEnv('JIRA_AUTH_TYPE', 'basic').toLowerCase();
const authType = authTypeRaw === 'pat' ? 'pat' : 'basic';

export const config = {
  timezone: 'Asia/Ho_Chi_Minh',
  jira: {
    baseUrl: normalizeBaseUrl(requireEnv('JIRA_BASE_URL')),
    email: optionalEnv('JIRA_EMAIL', ''),
    apiToken: requireEnv('JIRA_API_TOKEN'),
    authType,
    projectKey: optionalEnv('JIRA_PROJECT_KEY', ''),
  },
  lmx: {
    baseUrl: normalizeBaseUrl(optionalEnv('LMX_BASE_URL', 'http://localhost:8002')),
    path: optionalEnv('LMX_PATH', '/v1/chat/completions'),
    model: optionalEnv('LMX_MODEL', ''),
    required: parseBool(optionalEnv('LMX_REQUIRED')),
  },
  fchat: {
    enabled: parseBool(optionalEnv('FCHAT_ENABLED')),
    token: optionalEnv('FCHAT_TOKEN', ''),
    groupId: optionalEnv('FCHAT_GROUP_ID', ''),
    baseUrl: optionalEnv('FCHAT_BASE_URL', ''),
    sendText: parseBool(optionalEnv('FCHAT_SEND_TEXT')),
    sendPdf: parseBool(optionalEnv('FCHAT_SEND_PDF')),
    timeoutMs: parseIntEnv(optionalEnv('FCHAT_TIMEOUT_MS'), 30000),
    headerTemplate: optionalEnv('FCHAT_HEADER_TEMPLATE', ''),
  },
  maxConcurrency: 5,
  filters: {
    includeUsers: parseList(optionalEnv('USER_INCLUDE')),
    excludeUsers: parseList(optionalEnv('USER_EXCLUDE')),
  },
};
