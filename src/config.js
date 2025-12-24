import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import YAML from 'yaml';

dotenv.config();

const DEFAULT_CONFIG = {
  timezone: 'Asia/Ho_Chi_Minh',
  maxConcurrency: 5,
  enabled: true,
  projectName: '',
  lmx: {
    baseUrl: 'http://localhost:8002',
    path: '/v1/chat/completions',
    model: '',
    required: false,
  },
  fchat: {
    enabled: false,
    token: '',
    groupId: '',
    baseUrl: '',
    sendText: false,
    sendPdf: true,
    timeoutMs: 30000,
    headerTemplate: 'Con gửi tổng hợp action trên JIRA ngày {date}',
  },
  users: [],
};

const isObject = (val) => Boolean(val) && typeof val === 'object' && !Array.isArray(val);

const deepMerge = (base, override) => {
  const result = { ...base };
  Object.entries(override || {}).forEach(([key, val]) => {
    if (isObject(val) && isObject(base?.[key])) {
      result[key] = deepMerge(base[key], val);
    } else {
      result[key] = val;
    }
  });
  return result;
};

const normalizeBaseUrl = (url) => (url ? url.replace(/\/+$/, '') : url);

const toBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
};

const toList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

const toInt = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const readYaml = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(raw) || {};
};

const resolveConfigPath = (customPath) => {
  const candidate = customPath || process.env.PROJECTS_CONFIG || 'config.yaml';
  return path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
};

const normalizeJira = (jira = {}) => {
  const authTypeRaw = (jira.authType || 'basic').toLowerCase();
  const authType = authTypeRaw === 'pat' ? 'pat' : 'basic';
  return {
    baseUrl: normalizeBaseUrl(jira.baseUrl || ''),
    email: jira.email ? String(jira.email).trim() : '',
    apiToken: jira.apiToken ? String(jira.apiToken).trim() : '',
    authType,
    projectKey: jira.projectKey ? String(jira.projectKey).trim() : '',
  };
};

const normalizeFchat = (fchat = {}) => ({
  enabled: toBool(fchat.enabled),
  token: fchat.token ? String(fchat.token).trim() : '',
  groupId: fchat.groupId ? String(fchat.groupId).trim() : '',
  baseUrl: fchat.baseUrl ? String(fchat.baseUrl).trim() : '',
  sendText: toBool(fchat.sendText),
  sendPdf: toBool(fchat.sendPdf ?? true),
  timeoutMs: toInt(fchat.timeoutMs, DEFAULT_CONFIG.fchat.timeoutMs),
  headerTemplate: fchat.headerTemplate ? String(fchat.headerTemplate).trim() : DEFAULT_CONFIG.fchat.headerTemplate,
});

const normalizeLmx = (lmx = {}) => ({
  baseUrl: normalizeBaseUrl(lmx.baseUrl || DEFAULT_CONFIG.lmx.baseUrl),
  path: lmx.path ? String(lmx.path).trim() : DEFAULT_CONFIG.lmx.path,
  model: lmx.model ? String(lmx.model).trim() : '',
  required: toBool(lmx.required),
});

const normalizeProject = (projectId, projectConfig, { configDir, configPath }) => {
  const merged = {
    ...projectConfig,
    enabled: projectConfig.enabled !== undefined ? toBool(projectConfig.enabled) : true,
    projectName: projectConfig.projectName ? String(projectConfig.projectName).trim() : '',
    timezone: projectConfig.timezone || DEFAULT_CONFIG.timezone,
    maxConcurrency: toInt(projectConfig.maxConcurrency, DEFAULT_CONFIG.maxConcurrency),
    lmx: normalizeLmx(projectConfig.lmx),
    fchat: normalizeFchat(projectConfig.fchat),
    users: toList(projectConfig.users),
    jira: normalizeJira(projectConfig.jira),
  };

  if (!merged.jira.baseUrl) {
    throw new Error(`Missing jira.baseUrl for project ${projectId} in ${configPath}`);
  }
  if (!merged.jira.apiToken) {
    throw new Error(`Missing jira.apiToken for project ${projectId} in ${configPath}`);
  }
  if (!merged.jira.projectKey) {
    throw new Error(`Missing jira.projectKey for project ${projectId} in ${configPath}`);
  }

  return {
    ...merged,
    id: projectId,
    configPath,
    configDir,
  };
};

let cachedRoot = null;

export const loadRootConfig = (customPath) => {
  const resolvedPath = resolveConfigPath(customPath);
  if (cachedRoot && cachedRoot.configPath === resolvedPath) return cachedRoot;

  const parsed = readYaml(resolvedPath);
  cachedRoot = {
    ...parsed,
    configPath: resolvedPath,
    configDir: path.dirname(resolvedPath),
  };
  return cachedRoot;
};

export const loadProjectConfig = (projectIdInput, customPath) => {
  const root = loadRootConfig(customPath);
  const projectId = projectIdInput || process.env.DEFAULT_PROJECT || root.defaultProject;
  if (!projectId) {
    throw new Error('Missing project id: provide --project or set DEFAULT_PROJECT or defaultProject in config.');
  }

  const defaults = deepMerge(DEFAULT_CONFIG, root.defaults || {});
  const projectConfig = root.projects?.[projectId];
  if (!projectConfig) {
    const available = root.projects ? Object.keys(root.projects) : [];
    throw new Error(
      `Project "${projectId}" not found in ${root.configPath}${available.length ? `. Available: ${available.join(', ')}` : ''}`
    );
  }

  const merged = deepMerge(defaults, projectConfig);
  return normalizeProject(projectId, merged, { configDir: root.configDir, configPath: root.configPath });
};
