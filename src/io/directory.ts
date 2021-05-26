import { Readable } from 'stream';
import path from 'path';
import { createReadStream } from 'fs';

import FirstChunkStream from 'first-chunk-stream';
import stripBomStream from 'strip-bom-stream';
import { oneLine } from 'common-tags';

import { IOBase, IOBaseConstructorParams } from './base';
import { walkPromise } from './utils';

type Files = { [filename: string]: { size: number } };

type DirectoryConstructorParams = IOBaseConstructorParams;

export class Directory extends IOBase {
  files: Files;

  constructor({ filePath, stderr }: DirectoryConstructorParams) {
    super({ filePath, stderr });

    this.files = {};
  }

  async getFiles(_walkPromise = walkPromise): Promise<Files> {
    // If we have already processed this directory and have data on this
    // instance return that.
    if (Object.keys(this.files).length) {
      this.stderr.debug(oneLine`Files already exist for directory
        "${this.path}" returning cached data`);
      return this.files;
    }

    const files = await _walkPromise(this.path, {
      shouldIncludePath: (_path: string, isDirectory: boolean) => {
        return this.shouldScanFile(_path, isDirectory);
      },
      stderr: this.stderr,
    });

    this.files = files;
    this.entries = Object.keys(files);

    return files;
  }

  async getPath(_path: string) {
    if (!Object.prototype.hasOwnProperty.call(this.files, _path)) {
      throw new Error(`Path "${_path}" does not exist in this dir.`);
    }

    if (this.files[_path].size > this.maxSizeBytes) {
      throw new Error(`File "${_path}" is too large. Aborting`);
    }

    const absoluteDirPath = path.resolve(this.path);
    const filePath = path.resolve(path.join(absoluteDirPath, _path));

    // This is belt and braces. Should never happen that a file was in
    // the files object and yet doesn't meet these requirements.
    if (!filePath.startsWith(absoluteDirPath) || _path.startsWith('/')) {
      throw new Error(`Path argument must be relative to ${this.path}`);
    }

    return filePath;
  }

  async getFileAsStream(
    _path: string,
    { encoding } = { encoding: 'utf8' as BufferEncoding },
  ): Promise<Readable> {
    const filePath = await this.getPath(_path);

    const readStream = createReadStream(filePath, {
      autoClose: true,
      encoding,
      flags: 'r',
    });

    return !encoding ? readStream : readStream.pipe(stripBomStream());
  }

  async getFileAsString(_path: string): Promise<string> {
    const readStream = await this.getFileAsStream(_path);

    return new Promise((resolve, reject) => {
      let content = '';
      readStream.on('readable', () => {
        let chunk: string;
        // eslint-disable-next-line no-cond-assign
        while ((chunk = readStream.read()) !== null) {
          content += chunk.toString();
        }
      });

      readStream.on('end', () => {
        resolve(content);
      });

      readStream.on('error', reject);
    });
  }

  async getChunkAsBuffer(_path: string, chunkLength: number): Promise<Buffer> {
    const filePath = await this.getPath(_path);

    return new Promise((resolve, reject) => {
      const readStream = createReadStream(filePath, {
        flags: 'r',
        // This is important because you don't want to encode the bytes if you
        // are doing a binary check.
        encoding: '' as BufferEncoding,
        autoClose: true,
      });

      readStream.on('error', reject);

      readStream.pipe(
        new FirstChunkStream({ chunkLength }, (_, enc) => {
          resolve(enc);
        }),
      );
    });
  }
}
