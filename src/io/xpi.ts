import { Readable } from 'stream';

import yauzl, { Entry, ZipFile } from 'yauzl';
import FirstChunkStream from 'first-chunk-stream';
import stripBomStream from 'strip-bom-stream';
import { oneLine } from 'common-tags';

import { IOBaseConstructorParams, IOBase } from './base';

type Files = { [filename: string]: Entry };

type XpiConstructorParams = IOBaseConstructorParams & {
  zipLib?: typeof yauzl;
  keepAlive?: boolean;
};

/*
 * Simple Promise wrapper for the Yauzl unzipping lib to unpack add-on .xpis.
 *
 * Note: We're using the autoclose feature of yauzl as a result every operation
 * will open the zip, do something and then close it implicitly. This makes the
 * API easy to use and the consumer doesn't need to remember to close the
 * zipfile.
 */
export class Xpi extends IOBase {
  files: Files;

  keepAlive: boolean;

  zipLib: typeof yauzl;

  zipfile: ZipFile | undefined;

  constructor({
    filepath,
    stderr,
    zipLib = yauzl,
    keepAlive = false,
  }: XpiConstructorParams) {
    super({ filepath, stderr });

    this.files = {};
    this.keepAlive = keepAlive;
    this.zipLib = zipLib;
  }

  open(): Promise<ZipFile> {
    return new Promise((resolve, reject) => {
      // We rely on the `autoClose` feature of `yauzl`, but we cannot control
      // when precisely the `zipfile` is closed. If the `zipfile` is still open
      // and keepAlive is enabled, let's reuse it to avoid the creation of a
      // new file descriptor.
      if (this.keepAlive && this.zipfile && this.zipfile.isOpen) {
        resolve(this.zipfile);
        return;
      }

      this.zipLib.open(this.path, (err, zipfile) => {
        if (err) {
          return reject(err);
        }

        this.zipfile = zipfile;

        return resolve(zipfile);
      });
    });
  }

  handleEntry(entry: Entry, reject: (error: Error) => void) {
    if (/\/$/.test(entry.fileName)) {
      return;
    }
    if (!this.shouldScanFile(entry.fileName, false)) {
      this.stderr.debug(`skipping file: ${entry.fileName}`);
      return;
    }
    if (this.entries.includes(entry.fileName)) {
      this.stderr.info(oneLine`found duplicate file entry: "${entry.fileName}"
        in package`);

      reject(
        new Error(oneLine`DuplicateZipEntry: Entry
        "${entry.fileName}" has already been seen`),
      );
      return;
    }
    this.entries.push(entry.fileName);
    this.files[entry.fileName] = entry;
  }

  async getFiles(_onEventsSubscribed?: () => void): Promise<Files> {
    // If we have already processed the file and have data
    // on this instance return that.
    if (Object.keys(this.files).length) {
      const wantedFiles: Files = {};
      Object.keys(this.files).forEach((fileName) => {
        if (this.shouldScanFile(fileName, false)) {
          wantedFiles[fileName] = this.files[fileName];
        } else {
          this.stderr.debug(`skipping cached file: ${fileName}`);
        }
      });
      return wantedFiles;
    }

    const zipfile = await this.open();

    return new Promise((resolve, reject) => {
      zipfile.on('entry', (entry: Entry) => {
        this.handleEntry(entry, reject);
      });

      // When the last entry has been processed
      // and the fd is closed resolve the promise.
      // Note: we cannot use 'end' here as 'end' is fired
      // after the last entry event is emitted and streams
      // may still be being read with openReadStream.
      zipfile.on('close', () => {
        resolve(this.files);
      });

      if (_onEventsSubscribed) {
        // Run optional callback when we know the event handlers
        // have been inited. Useful for testing.
        if (typeof _onEventsSubscribed === 'function') {
          Promise.resolve().then(() => _onEventsSubscribed());
        }
      }
    });
  }

  checkPath(path: string) {
    if (!Object.prototype.hasOwnProperty.call(this.files, path)) {
      throw new Error(`Path "${path}" does not exist in this XPI`);
    }

    if (this.files[path].uncompressedSize > this.maxSizeBytes) {
      throw new Error(`File "${path}" is too large. Aborting.`);
    }
  }

  async getFileAsStream(path: string): Promise<Readable> {
    this.checkPath(path);
    const zipfile = await this.open();

    return new Promise((resolve, reject) => {
      zipfile.openReadStream(this.files[path], (err, readStream) => {
        if (err) {
          return reject(err);
        }
        if (!readStream) {
          return reject(new Error('readStream is falsey'));
        }
        return resolve(readStream.pipe(stripBomStream()));
      });
    });
  }

  async getFileAsString(path: string): Promise<string> {
    const fileStream = await this.getFileAsStream(path);

    return new Promise((resolve, reject) => {
      let buf = Buffer.from('');
      fileStream.on('data', (chunk: Uint8Array) => {
        buf = Buffer.concat([buf, chunk]);
      });

      // Once the file is assembled, resolve the promise.
      fileStream.on('end', () => {
        const fileString = buf.toString('utf8');
        resolve(fileString);
      });

      fileStream.on('error', reject);
    });
  }

  async getChunkAsBuffer(path: string, chunkSize: number): Promise<Buffer> {
    this.checkPath(path);
    const zipfile = await this.open();
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(this.files[path], (err, readStream) => {
        if (err) {
          reject(err);
          return;
        }

        if (!readStream) {
          reject(new Error('readStream is falsey'));
          return;
        }

        readStream.pipe(
          new FirstChunkStream({ chunkSize }, (_, enc) => {
            resolve(enc);
          }),
        );
      });
    });
  }
}
