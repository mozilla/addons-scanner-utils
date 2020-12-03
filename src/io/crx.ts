import defaultFs from 'fs';

import yauzl, { ZipFile } from 'yauzl';

import { IOBaseConstructorParams } from './base';
import { Xpi } from './xpi';

export function defaultParseCRX(buf: Buffer): Buffer {
  if (buf.readUInt32BE(0) !== 0x43723234) {
    throw new Error('Invalid header: Does not start with Cr24.');
  }

  const version = buf.readUInt32LE(4);

  if (version === 2) {
    const publicKeyLength = buf.readUInt32LE(8);
    const signatureLength = buf.readUInt32LE(12);
    // 16 = Magic number (4), CRX format version (4), lengths (2x4)
    return buf.slice(16 + publicKeyLength + signatureLength);
  }

  if (version === 3) {
    const crx3HeaderLength = buf.readUInt32LE(8);
    // 12 = Magic number (4), CRX format version (4), header length (4)
    return buf.slice(12 + crx3HeaderLength);
  }

  throw new Error('Unexpected crx format version number.');
}

type CrxConstructorParams = IOBaseConstructorParams & {
  fs?: typeof defaultFs;
  parseCRX?: typeof defaultParseCRX;
  zipLib?: typeof yauzl;
};

/*
 * A CRX file is just a ZIP file (eg an XPI) with some extra header
 * information. We handle opening the file with a CRX parser, then treat it
 * like an XPI after that.
 */
export class Crx extends Xpi {
  fs: typeof defaultFs;

  parseCRX: typeof defaultParseCRX;

  constructor({
    filePath,
    stderr,
    fs = defaultFs,
    parseCRX = defaultParseCRX,
    zipLib = yauzl,
  }: CrxConstructorParams) {
    super({ filePath, stderr, zipLib, autoClose: true });

    this.fs = fs;
    this.parseCRX = parseCRX;
  }

  open(): Promise<ZipFile> {
    return new Promise((resolve, reject) => {
      this.fs.readFile(this.path, (err, buf) => {
        if (err) {
          reject(err);
          return;
        }

        // Parse out the CRX header data from the actual ZIP contents.
        let zipBuffer: Buffer;
        try {
          zipBuffer = this.parseCRX(buf);
          this.stderr.debug('obtained zip data from CRX file');
        } catch (err2) {
          reject(err2);
          return;
        }

        this.zipLib.fromBuffer(zipBuffer, (err3, zipfile) => {
          if (err3) {
            reject(err3);
            return;
          }

          resolve(zipfile as ZipFile);
        });
      });
    });
  }
}
