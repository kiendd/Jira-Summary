const serializeDetails = (details) => {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details;
  if (Array.isArray(details)) return details.join(' ');
  if (typeof details === 'object') {
    return Object.entries(details)
      .map(([k, v]) => {
        if (v === null || v === undefined) return `${k}=`;
        if (typeof v === 'object') {
          try {
            return `${k}=${JSON.stringify(v)}`;
          } catch (err) {
            return `${k}=${String(v)}`;
          }
        }
        return `${k}=${v}`;
      })
      .join(' ');
  }
  return String(details);
};

const format = (level, msg, details) => {
  const time = new Date().toISOString();
  const base = `[${time}] [${level.toUpperCase()}] ${msg}`;
  const tail = serializeDetails(details);
  return tail ? `${base} ${tail}` : base;
};

export const logger = {
  info(details, msg) {
    if (msg) {
      console.log(format('info', msg, details));
    } else {
      console.log(format('info', details || '', undefined));
    }
  },
  warn(details, msg) {
    if (msg) {
      console.warn(format('warn', msg, details));
    } else {
      console.warn(format('warn', details || '', undefined));
    }
  },
  error(details, msg) {
    if (msg) {
      console.error(format('error', msg, details));
    } else {
      console.error(format('error', details || '', undefined));
    }
  },
  debug(details, msg) {
    if (process.env.DEBUG) {
      if (msg) {
        console.log(format('debug', msg, details));
      } else {
        console.log(format('debug', details || '', undefined));
      }
    }
  },
};
