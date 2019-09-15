import { Readable } from 'stream';

import { Stderr, Stdout } from './stdio';

export const createFakeStdout = (): Stdout => {
  return {
    write: jest.fn(),
  };
};

export const createFakeStderr = (): Stderr => {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
};

export const readStringFromStream = (
  readStream: Readable,
  encoding: string | undefined,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let content = '';
    readStream.on('readable', () => {
      let chunk;
      // eslint-disable-next-line no-cond-assign
      while ((chunk = readStream.read()) !== null) {
        content += chunk.toString(encoding);
      }
    });
    readStream.on('end', () => {
      resolve(content);
    });
    readStream.on('error', reject);
  });
};

export const createFakeFsStats = ({
  isFile = false,
  isDirectory = false,
} = {}) => {
  return {
    isDirectory: () => isDirectory,
    isFile: () => isFile,
  };
};
