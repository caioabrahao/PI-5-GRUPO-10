/**
 * Logger simples com cores ANSI e timestamps.
 * Usado em todo o backend para padronizar logs.
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toISOString();
}

function format(level, color, message, meta) {
  const base = `${colors.gray}[${timestamp()}]${colors.reset} ${color}[${level}]${colors.reset} ${message}`;
  if (meta !== undefined) {
    return `${base} ${colors.gray}${JSON.stringify(meta)}${colors.reset}`;
  }
  return base;
}

const logger = {
  info: (msg, meta) => console.log(format('INFO', colors.cyan, msg, meta)),
  success: (msg, meta) => console.log(format('OK', colors.green, msg, meta)),
  warn: (msg, meta) => console.warn(format('WARN', colors.yellow, msg, meta)),
  error: (msg, meta) => console.error(format('ERROR', colors.red, msg, meta)),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(format('DEBUG', colors.blue, msg, meta));
    }
  },
};

module.exports = logger;
