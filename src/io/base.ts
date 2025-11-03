import { Readable } from 'stream';

import { oneLine } from 'common-tags';

import { FLAGGED_FILE_MAGIC_NUMBERS_LENGTH, MAX_FILE_SIZE_MB } from './const';
import { Stderr } from '../stdio';

type ScanFileFunction = (_path: string, isDirectory: boolean) => boolean;

type Files = Record<string, unknown>;

export type IOBaseConstructorParams = {
  filePath: string;
  stderr: Stderr;
};

/*
 * Base class for io operations for both an Xpi or a directory.
 */
export class IOBase {
  path: string;

  stderr: Stderr;

  files: Files;

  entries: string[];

  maxSizeBytes: number;

  shouldScanFile: ScanFileFunction;

  constructor({ filePath, stderr }: IOBaseConstructorParams) {
    this.path = filePath;
    this.stderr = stderr;
    this.files = {};
    this.entries = [];
    // If this is too large the node process will hit a RangeError
    // when it runs out of memory.
    this.maxSizeBytes = 1024 * 1024 * MAX_FILE_SIZE_MB;
    // A callback that accepts a relative file path and returns
    // true if the path should be included in results for scanning.
    this.shouldScanFile = () => true;
  }

  setScanFileCallback(callback: ScanFileFunction) {
    if (typeof callback === 'function') {
      this.shouldScanFile = callback;
    }
  }

  getFile(
    path: string,
    fileStreamType: 'stream' | 'string' | 'chunk' = 'string',
  ) {
    switch (fileStreamType) {
      case 'stream':
        return this.getFileAsStream(path);
      case 'string':
        return this.getFileAsString(path);
      case 'chunk':
        // Assuming that chunk is going to be primarily used for finding magic
        // numbers in files, then there's no need to have the default be longer
        // than that.
        return this.getChunkAsBuffer(path, FLAGGED_FILE_MAGIC_NUMBERS_LENGTH);
      default:
        throw new Error(oneLine`Unexpected fileStreamType
          value "${fileStreamType}" should be one of "string",
          "stream"`);
    }
  }

  async getFilesByExt(...extensions: string[]) {
    for (let i = 0; i < extensions.length; i++) {
      const ext = extensions[i];
      if (ext.indexOf('.') !== 0) {
        throw new Error("File extension must start with '.'");
      }
    }

    const filesObject = await this.getFiles();
    const files: string[] = [];

    Object.keys(filesObject).forEach((filename) => {
      extensions.forEach((ext) => {
        if (filename.endsWith(ext)) {
          files.push(filename);
        }
      });
    });

    return files;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-function-type
  async getFiles(optionalArgument?: Function): Promise<Files> {
    throw new Error('getFiles is not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getFileAsStream(path: string): Promise<Readable> {
    throw new Error('getFileAsStream is not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getFileAsString(path: string): Promise<string> {
    throw new Error('getFileAsString is not implemented');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getChunkAsBuffer(path: string, chunkLength: number): Promise<Buffer> {
    throw new Error('getChunkAsBuffer is not implemented');
  }

  close() {
    // noop
  }
}
