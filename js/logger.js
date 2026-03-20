// js/logger.js — Simple Logger

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// For now, we'll just log to the console.
// We can expand this later to save logs.
const currentLevel = LOG_LEVELS.DEBUG;

const logs = [];
const MAX_LOGS = 2000;

function log(level, ...args) {
  if (level < currentLevel) {
    return;
  }

  const timestamp = new Date().toISOString();
  const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);

  console.log(`[${timestamp}] [${levelName}]`, ...args);

  // Save to memory for export
  const logLine = `[${timestamp}] [${levelName}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;
  logs.push(logLine);
  if (logs.length > MAX_LOGS) logs.shift();
}

export const logger = {
  debug: (...args) => log(LOG_LEVELS.DEBUG, ...args),
  info: (...args) => log(LOG_LEVELS.INFO, ...args),
  warn: (...args) => log(LOG_LEVELS.WARN, ...args),
  error: (...args) => log(LOG_LEVELS.ERROR, ...args),
  getLogs: () => logs.join('\n'),
};
