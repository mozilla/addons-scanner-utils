import { getRequestId, getTraceId } from './request-context';

/**
 * The Cloud Logging severities the scanners use, least to most severe.
 */
export type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

/**
 * Extra fields attached to a log entry. Each becomes `jsonPayload.<name>` in
 * Cloud Logging, so they can be filtered on.
 */
export type LogFields = Record<string, unknown>;

export type Logger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warning: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

/**
 * Name of the environment variable holding the Google Cloud project id. It is
 * needed to format the trace field; without it the lines are still structured,
 * just not joined to Cloud Run's request entries. Cloud Run does not set it,
 * so it is set on the service (one line per scanner in webservices-infra).
 */
export const PROJECT_ID_ENV_VAR = 'GOOGLE_CLOUD_PROJECT';

/**
 * Configuration options for the logger.
 *
 * @property _console - Console object to write to (for testing purposes)
 * @property _process - Process object for environment variables (for testing
 *   purposes)
 * @property projectId - Google Cloud project id used in the trace field.
 *   Defaults to the `GOOGLE_CLOUD_PROJECT` environment variable.
 */
export type LoggerConfig = {
  _console?: typeof console;
  _process?: typeof process;
  projectId?: string;
};

/**
 * Create a logger that writes one JSON object per line, the format Cloud Run
 * parses into a structured log entry: `severity` becomes the entry's severity,
 * `message` its text, and `logging.googleapis.com/trace` joins it to the
 * request log entry for the same request.
 *
 * Every line carries the `request_id` of the request being handled (the
 * `X-AMO-Request-ID` header, or a generated UUID) when there is one, so a
 * line written outside a request, such as at startup, simply has no
 * `request_id`.
 *
 * Writing a plain object with `console.error()` must be avoided: Node prints
 * it over several lines once it is longer than 80 characters, and Cloud Run
 * stores each line as a separate entry with no severity.
 *
 * `ERROR` and `WARNING` go to stderr, `INFO` and `DEBUG` to stdout. The
 * severity in the JSON is what Cloud Logging uses either way.
 */
export const createLogger = ({
  _console = console,
  _process = process,
  projectId = _process.env[PROJECT_ID_ENV_VAR],
}: LoggerConfig = {}): Logger => {
  const write = (
    severity: LogSeverity,
    message: string,
    fields: LogFields = {},
  ) => {
    const requestId = getRequestId();
    const traceId = getTraceId();

    // The fixed fields come last so that `fields` cannot override them.
    const entry: Record<string, unknown> = {
      ...fields,
      severity,
      message,
      ...(requestId ? { request_id: requestId } : {}),
      ...(traceId && projectId
        ? {
            'logging.googleapis.com/trace': `projects/${projectId}/traces/${traceId}`,
          }
        : {}),
    };

    const line = JSON.stringify(entry);

    if (severity === 'ERROR' || severity === 'WARNING') {
      _console.error(line);
    } else {
      _console.log(line);
    }
  };

  return {
    debug: (message, fields) => write('DEBUG', message, fields),
    info: (message, fields) => write('INFO', message, fields),
    warning: (message, fields) => write('WARNING', message, fields),
    error: (message, fields) => write('ERROR', message, fields),
  };
};
