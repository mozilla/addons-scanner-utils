export type Stderr = {
  debug: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

type CreateConsoleStderrParams = {
  _console?: typeof console;
  programName: string;
  verboseLevel: number;
};

// Logs (for humans) should be sent to `stderr` so that we can pipe the
// `stdout` output to other tools. Verbosity is controlled by the
// `verboseLevel` argument (and the number of `-v` passed to the CLI).
//
// By default, only errors are shown.
export const createConsoleStderr = ({
  _console = console,
  programName,
  verboseLevel = 0,
}: CreateConsoleStderrParams): Stderr => {
  const logWithPrefix = (message: string) => {
    _console.error(`${programName}: ${message}`);
  };

  const stderr: Stderr = {
    error(message: string) {
      if (verboseLevel >= 0) {
        logWithPrefix(message);
      }
    },
    info(message: string) {
      if (verboseLevel >= 1) {
        logWithPrefix(message);
      }
    },
    debug(message: string) {
      if (verboseLevel >= 2) {
        logWithPrefix(message);
      }
    },
  };

  return stderr;
};

export type InMemoryStderr = Stderr & {
  messages: {
    debug: string[];
    error: string[];
    info: string[];
  };
};

export const createInMemoryStderr = (): InMemoryStderr => {
  return {
    messages: {
      debug: [],
      error: [],
      info: [],
    },
    debug(message: string) {
      this.messages.debug.push(message);
    },
    error(message: string) {
      this.messages.error.push(message);
    },
    info(message: string) {
      this.messages.info.push(message);
    },
  };
};

export type Stdout = {
  write: (message: string) => void;
};

// `stdout` should be used for final outputs, and usually once at the end of
// the command.
export const createConsoleStdout = ({ _console = console } = {}): Stdout => {
  return {
    write(message: string) {
      _console.log(message);
    },
  };
};

export type InMemoryStdout = Stdout & { output: string };

export const createInMemoryStdout = (): InMemoryStdout => {
  return {
    output: '',
    write(message: string) {
      this.output = message;
    },
  };
};
