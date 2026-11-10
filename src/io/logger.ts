/**
 * Minimal logger interface used by the IO classes (pino-compatible).
 */
export type IOLogger = {
  debug: (message: string) => void;
  info: (message: string) => void;
};
