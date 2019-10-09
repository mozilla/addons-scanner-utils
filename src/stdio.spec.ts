import {
  createConsoleStderr,
  createConsoleStdout,
  createInMemoryStderr,
  createInMemoryStdout,
} from './stdio';

describe(__filename, () => {
  const createFakeConsole = () => {
    return {
      ...console,
      error: jest.fn(),
      log: jest.fn(),
    };
  };

  describe('createConsoleStderr', () => {
    describe('error', () => {
      it('prefixes the error messages with the name of the tool', () => {
        const _console = createFakeConsole();
        const programName = 'some-program';
        const stderr = createConsoleStderr({
          _console,
          programName,
          verboseLevel: 0,
        });
        const message = 'hello';

        stderr.error(message);

        expect(_console.error).toHaveBeenCalledWith(
          `${programName}: ${message}`,
        );
      });
    });

    describe('info', () => {
      it('prefixes the info messages with the name of the tool', () => {
        const _console = createFakeConsole();
        const programName = 'some-program';
        const stderr = createConsoleStderr({
          _console,
          programName,
          verboseLevel: 1,
        });
        const message = 'hello';

        stderr.info(message);

        expect(_console.error).toHaveBeenCalledWith(
          `${programName}: ${message}`,
        );
      });

      it('does not log info messages when verboseLevel is lower than 1', () => {
        const _console = createFakeConsole();
        const stderr = createConsoleStderr({
          _console,
          programName: 'prog',
          verboseLevel: 0,
        });

        stderr.info('hello');

        expect(_console.error).not.toHaveBeenCalled();
      });

      it('needs verboseLevel >= 1 to log info messages', () => {
        const _console = createFakeConsole();
        const stderr = createConsoleStderr({
          _console,
          programName: 'prog',
          verboseLevel: 1,
        });

        stderr.info('hello');

        expect(_console.error).toHaveBeenCalled();
      });
    });

    describe('debug', () => {
      it('prefixes the debug messages with the name of the tool', () => {
        const _console = createFakeConsole();
        const programName = 'some-program';
        const stderr = createConsoleStderr({
          _console,
          programName,
          verboseLevel: 2,
        });
        const message = 'hello';

        stderr.debug(message);

        expect(_console.error).toHaveBeenCalledWith(
          `${programName}: ${message}`,
        );
      });

      it('does not log debug messages when verboseLevel is lower than 2', () => {
        const _console = createFakeConsole();
        const stderr = createConsoleStderr({
          _console,
          programName: 'prog',
          verboseLevel: 1,
        });

        stderr.debug('hello');

        expect(_console.error).not.toHaveBeenCalled();
      });

      it('needs verboseLevel >= 2 to log debug messages', () => {
        const _console = createFakeConsole();
        const stderr = createConsoleStderr({
          _console,
          programName: 'prog',
          verboseLevel: 2,
        });

        stderr.debug('hello');

        expect(_console.error).toHaveBeenCalled();
      });
    });
  });

  describe('createConsoleStdout', () => {
    it('writes a message using the console.log method', () => {
      const _console = createFakeConsole();
      const stdout = createConsoleStdout({ _console });
      const message = 'hello';

      stdout.write(message);

      expect(_console.log).toHaveBeenCalledWith(message);
    });
  });

  describe('createInMemoryStdout', () => {
    it('writes a message to stdout.output', () => {
      const stdout = createInMemoryStdout();
      const message = 'hello';

      stdout.write(message);

      expect(stdout.output).toEqual(message);
    });

    it('only writes a single message to stdout.output', () => {
      const stdout = createInMemoryStdout();
      const message = 'hello';

      stdout.write(message);
      stdout.write(message);
      stdout.write(message);

      expect(stdout.output).toEqual(message);
    });
  });

  describe('createInMemoryStderr', () => {
    it('stores the debug logs', () => {
      const stderr = createInMemoryStderr();
      const message1 = 'debug 1';
      const message2 = 'debug 2';

      stderr.debug(message1);
      stderr.debug(message2);

      expect(stderr.messages.debug).toEqual([message1, message2]);
    });

    it('stores the error logs', () => {
      const stderr = createInMemoryStderr();
      const message1 = 'error 1';
      const message2 = 'error 2';

      stderr.error(message1);
      stderr.error(message2);

      expect(stderr.messages.error).toEqual([message1, message2]);
    });

    it('stores the info logs', () => {
      const stderr = createInMemoryStderr();
      const message1 = 'info 1';
      const message2 = 'info 2';

      stderr.info(message1);
      stderr.info(message2);

      expect(stderr.messages.info).toEqual([message1, message2]);
    });
  });
});
