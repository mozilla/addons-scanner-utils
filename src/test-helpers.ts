import { Readable } from 'stream';

import { ZipFile, RandomAccessReader } from 'yauzl';

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

class FakeRandomAccessReader extends RandomAccessReader {}

export const createFakeZipFile = ({
  autoClose = true,
  centralDirectoryOffset = 0,
  comment = '',
  decodeStrings = true,
  // This is set to `1` to avoid an error with `RandomAccessReader.unref()`
  // because we are using a `FakeRandomAccessReader`
  entryCount = 1,
  fileSize = 0,
  // This is set to `true` to avoid an error due to the ZipFile trying to
  // automatically load the entries (because `entryCount = 1` above).
  lazyEntries = true,
  reader = new FakeRandomAccessReader(),
  validateEntrySizes = true,
} = {}): ZipFile => {
  return new ZipFile(
    reader,
    centralDirectoryOffset,
    fileSize,
    entryCount,
    comment,
    autoClose,
    lazyEntries,
    decodeStrings,
    validateEntrySizes,
  );
};
