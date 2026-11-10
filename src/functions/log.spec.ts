import { PROJECT_ID_ENV_VAR, createLogger } from './log';
import { requestContextStorage } from './request-context';

describe(__filename, () => {
  const createConsole = () =>
    ({
      ...console,
      error: jest.fn(),
      log: jest.fn(),
    }) as typeof console;

  const createProcessWithEnv = (env = {}) => {
    return { ...process, env } as typeof process;
  };

  const lastLine = (fn: jest.Mock): Record<string, unknown> => {
    expect(fn).toHaveBeenCalledTimes(1);
    const [line] = fn.mock.calls[0];
    expect(typeof line).toEqual('string');
    expect(line).not.toContain('\n');
    return JSON.parse(line);
  };

  it('writes one JSON line with the severity and message', () => {
    const _console = createConsole();
    const log = createLogger({ _console, _process: createProcessWithEnv() });

    log.info('scan complete');

    expect(lastLine(_console.log as jest.Mock)).toEqual({
      severity: 'INFO',
      message: 'scan complete',
    });
  });

  it.each([
    ['debug', 'DEBUG', 'log'],
    ['info', 'INFO', 'log'],
    ['warning', 'WARNING', 'error'],
    ['error', 'ERROR', 'error'],
  ] as const)(
    'writes %s as severity %s on console.%s',
    (method, severity, stream) => {
      const _console = createConsole();
      const log = createLogger({ _console, _process: createProcessWithEnv() });

      log[method]('some message');

      expect(lastLine(_console[stream] as jest.Mock)).toMatchObject({
        severity,
      });
      const other = stream === 'log' ? 'error' : 'log';
      expect(_console[other]).not.toHaveBeenCalled();
    },
  );

  it('includes the extra fields', () => {
    const _console = createConsole();
    const log = createLogger({ _console, _process: createProcessWithEnv() });

    log.error('download failed', { status: 404, extra_info: null });

    expect(lastLine(_console.error as jest.Mock)).toEqual({
      severity: 'ERROR',
      message: 'download failed',
      status: 404,
      extra_info: null,
    });
  });

  it('does not let the extra fields override the severity or message', () => {
    const _console = createConsole();
    const log = createLogger({ _console, _process: createProcessWithEnv() });

    log.warning('real message', { severity: 'DEBUG', message: 'other' });

    expect(lastLine(_console.error as jest.Mock)).toEqual({
      severity: 'WARNING',
      message: 'real message',
    });
  });

  it('includes the request ID of the active request context', () => {
    const _console = createConsole();
    const log = createLogger({ _console, _process: createProcessWithEnv() });

    requestContextStorage.run({ requestId: 'req-123' }, () => {
      log.info('inside a request');
    });

    expect(lastLine(_console.log as jest.Mock)).toEqual({
      severity: 'INFO',
      message: 'inside a request',
      request_id: 'req-123',
    });
  });

  it('includes the trace when a trace ID and project ID are known', () => {
    const _console = createConsole();
    const traceId = '105445aa7843bc8bf206b12000100000';
    const log = createLogger({
      _console,
      _process: createProcessWithEnv({ [PROJECT_ID_ENV_VAR]: 'some-project' }),
    });

    requestContextStorage.run({ requestId: 'req-123', traceId }, () => {
      log.info('traced');
    });

    expect(lastLine(_console.log as jest.Mock)).toMatchObject({
      'logging.googleapis.com/trace': `projects/some-project/traces/${traceId}`,
    });
  });

  it('accepts the project ID as an option', () => {
    const _console = createConsole();
    const traceId = '105445aa7843bc8bf206b12000100000';
    const log = createLogger({
      _console,
      _process: createProcessWithEnv(),
      projectId: 'explicit-project',
    });

    requestContextStorage.run({ traceId }, () => {
      log.info('traced');
    });

    expect(lastLine(_console.log as jest.Mock)).toMatchObject({
      'logging.googleapis.com/trace': `projects/explicit-project/traces/${traceId}`,
    });
  });

  it('omits the trace when the project ID is unknown', () => {
    const _console = createConsole();
    const log = createLogger({ _console, _process: createProcessWithEnv() });

    requestContextStorage.run(
      { requestId: 'req-123', traceId: '105445aa7843bc8bf206b12000100000' },
      () => {
        log.info('not traced');
      },
    );

    expect(lastLine(_console.log as jest.Mock)).not.toHaveProperty(
      'logging.googleapis.com/trace',
    );
  });

  it('omits the trace when the request carried no trace ID', () => {
    const _console = createConsole();
    const log = createLogger({
      _console,
      _process: createProcessWithEnv({ [PROJECT_ID_ENV_VAR]: 'some-project' }),
    });

    requestContextStorage.run({ requestId: 'req-123' }, () => {
      log.info('not traced');
    });

    expect(lastLine(_console.log as jest.Mock)).not.toHaveProperty(
      'logging.googleapis.com/trace',
    );
  });

  it('keeps a long entry on one line', () => {
    const _console = createConsole();
    const log = createLogger({ _console, _process: createProcessWithEnv() });

    requestContextStorage.run(
      { requestId: 'dcb73090-563c-42d3-9e47-25018be96ce1' },
      () => {
        log.warning('unsupported content type', {
          status: 415,
          extra_info: null,
        });
      },
    );

    // `lastLine` asserts there is no newline in the line.
    expect(lastLine(_console.error as jest.Mock)).toMatchObject({
      status: 415,
    });
  });
});
