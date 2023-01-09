import { Readable } from 'stream';

import yauzl, { Entry, ZipFile } from 'yauzl';
import FirstChunkStream from 'first-chunk-stream';
import stripBomStream from 'strip-bom-stream';
import { oneLine } from 'common-tags';

import { IOBaseConstructorParams, IOBase } from './base';
import { InvalidZipFileError, DuplicateZipEntryError } from '../errors';

export type Files = { [filename: string]: Entry };

type XpiConstructorParams = IOBaseConstructorParams & {
  autoClose?: boolean;
  zipLib?: typeof yauzl;
};

/*
 * Simple Promise wrapper for the Yauzl unzipping lib to unpack add-on .xpis.
 *
 * Note: We're using the autoclose feature of yauzl as a result every operation
 * will open the zip, do something and then close it implicitly. This makes the
 * API easy to use and the consumer doesn't need to remember to close the
 * zipfile. That being said, we sometimes need to control the autoclose
 * feature, so we can disable it if needed.
 */
export class Xpi extends IOBase {
  autoClose: boolean;

  files: Files;

  processed: boolean;

  zipLib: typeof yauzl;

  zipfile: ZipFile | undefined;

  constructor({
    autoClose = true,
    filePath,
    stderr,
    zipLib = yauzl,
  }: XpiConstructorParams) {
    super({ filePath, stderr });

    this.autoClose = autoClose;
    this.files = {};
    this.processed = false;
    this.zipLib = zipLib;
  }

  open(): Promise<ZipFile> {
    return new Promise((resolve, reject) => {
      // When we disable the autoclose feature, we can reuse the same file
      // descriptor instead of creating new ones, but only if we have opened
      // the file once and the descriptor is still open.
      if (!this.autoClose && this.zipfile && this.zipfile.isOpen) {
        resolve(this.zipfile);
        return;
      }

      this.zipLib.open(
        this.path,
        {
          autoClose: this.autoClose,
          // Enable checks on invalid chars in zip entries filenames.
          strictFileNames: true,
          // Decode automatically filenames and zip entries content from buffer into strings
          // and autodetects their encoding.
          //
          // NOTE: this is also mandatory because without this option set to true
          // strictFileNames option is ignored.
          decodeStrings: true,
        },
        (err, zipfile) => {
          if (err) {
            return reject(err);
          }

          this.zipfile = zipfile;

          return resolve(zipfile as ZipFile);
        },
      );
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
        new DuplicateZipEntryError(oneLine`Entry "${entry.fileName}" has already
          been seen`),
      );
      return;
    }
    this.entries.push(entry.fileName);
    this.files[entry.fileName] = entry;
  }

  async getFiles(_onEventsSubscribed?: () => void): Promise<Files> {
    // If we have already processed the file and have data on this instance
    // return that.
    if (this.processed) {
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
      zipfile.on('error', (err: Error) => {
        reject(new InvalidZipFileError(err.message));
      });

      zipfile.on('entry', (entry: Entry) => {
        this.handleEntry(entry, reject);
      });

      // When the last entry has been processed, resolve the promise.
      //
      // Note: we were using 'close' before because of a potential race
      // condition but we are not able to reproduce it and the `yauzl` code has
      // changed a bit. We are using 'end' again now so that this function
      // continues to work with `autoClose: false`.
      //
      // See: https://github.com/mozilla/addons-linter/pull/43
      zipfile.on('end', () => {
        this.processed = true;
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

  async getChunkAsBuffer(path: string, chunkLength: number): Promise<Buffer> {
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
          new FirstChunkStream({ chunkLength }, (_, enc) => {
            resolve(enc);
          }),
        );
      });
    });
  }

  close() {
    if (this.autoClose) {
      return;
    }

    if (this.zipfile) {
      // According to the yauzl docs, it is safe to call `close()` multiple
      // times so we don't check `isOpen` here.
      this.zipfile.close();
    }
  }
}
