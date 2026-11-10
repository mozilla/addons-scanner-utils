import pino from 'pino';

import { createLogger, getLogger } from './logger';
import { requestContextStorage } from './request-context';

describe(__filename, () => {
  const createDestination = () => {
    const lines: string[] = [];

    return {
      destination: { write: (line: string) => lines.push(line) },
      entries: () => lines.map((line) => JSON.parse(line)),
    };
  };

  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });

  describe('createLogger', () => {
    const createProcessWithEnv = (env: NodeJS.ProcessEnv) =>
      ({ ...process, env }) as typeof process;

    it('writes GCP structured logs', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination });
      const err = new Error('oops');

      logger.error({ err }, 'some message');

      expect(entries()).toEqual([
        expect.objectContaining({
          severity: 'ERROR',
          message: 'some message',
          stack_trace: err.stack,
          time: expect.any(String),
        }),
      ]);
      expect(new Date(entries()[0].time).toISOString()).toEqual(
        entries()[0].time,
      );
    });

    it.each([
      ['trace', 'DEBUG'],
      ['debug', 'DEBUG'],
      ['info', 'INFO'],
      ['warn', 'WARNING'],
      ['error', 'ERROR'],
      ['fatal', 'CRITICAL'],
    ] as const)('maps the %s level to %s', (level, severity) => {
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination, level: 'trace' });

      logger[level]('hello');

      expect(entries()).toEqual([expect.objectContaining({ severity })]);
    });

    it('does not add a stack trace without an error', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination });

      logger.error({ err: 'not an error' }, 'some message');

      expect(entries()[0]).not.toHaveProperty('stack_trace');
    });

    it('uses the package name as the service name', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({
        destination,
        _process: createProcessWithEnv({ npm_package_name: 'some-scanner' }),
      });

      logger.info('hello');

      expect(entries()[0].serviceContext).toEqual({ service: 'some-scanner' });
    });

    it('defaults the service name to "local"', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({
        destination,
        _process: createProcessWithEnv({}),
      });

      logger.info('hello');

      expect(entries()[0].serviceContext).toEqual({ service: 'local' });
    });

    it('uses K_SERVICE as the service name on Cloud Run', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({
        destination,
        _process: createProcessWithEnv({
          K_SERVICE: 'some-cloud-run-service',
          npm_package_name: 'some-scanner',
        }),
      });

      logger.info('hello');

      expect(entries()[0].serviceContext).toEqual({
        service: 'some-cloud-run-service',
      });
    });

    it('logs at the info level by default', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination });

      logger.debug('debug');
      logger.info('info');

      expect(entries()).toEqual([expect.objectContaining({ message: 'info' })]);
    });

    it('reads the level from the LOG_LEVEL env variable', () => {
      process.env.LOG_LEVEL = 'debug';
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination });

      logger.debug('debug');

      expect(entries()).toEqual([
        expect.objectContaining({ message: 'debug' }),
      ]);
    });

    it('accepts a level', () => {
      process.env.LOG_LEVEL = 'debug';
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination, level: 'error' });

      logger.info('info');

      expect(entries()).toEqual([]);
    });

    it('adds the request ID when available', () => {
      const { destination, entries } = createDestination();
      const logger = createLogger({ destination });

      requestContextStorage.run({ requestId: 'some-request-id' }, () => {
        logger.info('inside');
      });
      logger.info('outside');

      expect(entries()).toEqual([
        expect.objectContaining({
          message: 'inside',
          request_id: 'some-request-id',
        }),
        expect.not.objectContaining({ request_id: expect.anything() }),
      ]);
    });
  });

  describe('default destination', () => {
    it('writes to stderr', () => {
      const destination = jest.spyOn(pino, 'destination');

      createLogger();

      expect(destination).toHaveBeenCalledWith({ dest: 2, sync: true });
      destination.mockRestore();
    });
  });

  describe('getLogger', () => {
    it('returns the same logger instance', () => {
      expect(getLogger()).toBe(getLogger());
    });
  });
});
