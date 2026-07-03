type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || 'info';

const shouldLog = (level: LogLevel): boolean =>
  LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];

const formatTimestamp = (): string =>
  new Date().toISOString();

const sanitizeError = (err: unknown): Record<string, unknown> => {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    };
  }
  return { message: String(err) };
};

interface LogPayload {
  message: string;
  [key: string]: unknown;
}

const log = (level: LogLevel, payload: LogPayload): void => {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    timestamp: formatTimestamp(),
    service: 'dashmate-api',
    ...payload,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    log('debug', { message, ...meta }),
  info: (message: string, meta?: Record<string, unknown>) =>
    log('info', { message, ...meta }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    log('warn', { message, ...meta }),
  error: (message: string, error?: unknown, meta?: Record<string, unknown>) =>
    log('error', {
      message,
      ...(error ? { error: sanitizeError(error) } : {}),
      ...meta,
    }),
};
