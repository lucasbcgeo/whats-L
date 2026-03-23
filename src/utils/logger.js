const levels = { INFO: 0, WARN: 1, ERROR: 2 };
const currentLevel = levels[process.env.LOG_LEVEL] ?? levels.INFO;

function log(level, ...args) {
  if (levels[level] >= currentLevel) {
    const method = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[method](...args);
  }
}

module.exports = {
  INFO: (...args) => log('INFO', ...args),
  WARN: (...args) => log('WARN', ...args),
  ERROR: (...args) => log('ERROR', ...args),
};
