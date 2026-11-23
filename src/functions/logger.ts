import pino, { DestinationStream, Logger } from 'pino';

import { getRequestId } from './request-context';

export type { Logger } from 'pino';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * The logger of the app, set by `createExpressApp()`. Entries include the
       * request ID.
       */
      logger: Logger;
    }
  }
}

/**
 * Map pino levels to Google Cloud Logging severities.
 */
const SEVERITIES = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
} as const;

/**
 * A log level. `silent` disables logging.
 */
export type LogLevel = keyof typeof SEVERITIES | 'silent';

const LOG_LEVELS: string[] = [...Object.keys(SEVERITIES), 'silent'];

const isLogLevel = (value: string): value is LogLevel =>
  LOG_LEVELS.includes(value);

/**
 * Options for creating a logger.
 *
 * @property level - Minimum log level (default: `LOG_LEVEL` env var, or
 *   `info`)
 * @property destination - Where to write logs (default: stderr)
 * @property _process - Process object (for testing purposes)
 */
export type CreateLoggerOptions = {
  level?: LogLevel;
  destination?: DestinationStream;
  _process?: typeof process;
};

/**
 * Create a pino logger writing single-line JSON logs for Google Cloud Logging.
 * Most consumers should use {@link getLogger} instead.
 *
 * @see https://cloud.google.com/logging/docs/structured-logging
 */
export const createLogger = ({
  level,
  destination,
  _process = process,
}: CreateLoggerOptions = {}): Logger => {
  // The level can come from an env var, so we validate it at runtime too and
  // fall back to `info` when it is invalid.
  const requestedLevel = level || _process.env.LOG_LEVEL || 'info';
  const logLevel = isLogLevel(requestedLevel) ? requestedLevel : 'info';

  const logger = pino(
    {
      level: logLevel,
      messageKey: 'message',
      timestamp: pino.stdTimeFunctions.isoTime,
      base: {
        // `K_SERVICE` is set by Cloud Run.
        serviceContext: {
          service:
            _process.env.K_SERVICE || _process.env.npm_package_name || 'local',
        },
      },
      formatters: {
        level: (label) => ({
          severity: SEVERITIES[label as keyof typeof SEVERITIES] ?? 'DEFAULT',
        }),
        // Cloud Error Reporting needs the stack trace in `stack_trace`.
        log: (entry) =>
          entry.err instanceof Error
            ? { ...entry, stack_trace: entry.err.stack }
            : entry,
      },
      // Add the request ID when it is set.
      mixin: () => {
        const requestId = getRequestId();

        return requestId ? { request_id: requestId } : {};
      },
    },
    // Synchronous so that logs aren't lost on `process.exit()`.
    destination ?? pino.destination({ dest: 2, sync: true }),
  );

  if (logLevel !== requestedLevel) {
    logger.warn(`Invalid log level "${requestedLevel}", using "${logLevel}"`);
  }

  return logger;
};

let defaultLogger: Logger | null = null;

/**
 * Return the shared logger, used by {@link createExpressApp} by default.
 */
export const getLogger = (): Logger => {
  defaultLogger ??= createLogger();

  return defaultLogger;
};
