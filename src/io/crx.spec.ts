import defaultFs from 'fs';

import yauzl, { Entry, ZipFile } from 'yauzl';

import { defaultParseCRX, Crx } from './crx';
import { Files } from './xpi';
import { DEFLATE_COMPRESSION, NO_COMPRESSION } from './const';
import { createFakeStderr, createFakeZipFile } from '../test-helpers';

describe(__filename, () => {
  const defaultData = {
    compressionMethod: DEFLATE_COMPRESSION,
  };

  const chromeManifestEntry = {
    ...defaultData,
    compressedSize: 138,
    uncompressedSize: 275,
    fileName: 'chrome.manifest',
  } as Entry;

  const installFileEntry = {
    ...defaultData,
    compressedSize: 416,
    uncompressedSize: 851,
    fileName: 'manifest.json',
  } as Entry;

  const chromeContentDir = {
    compressionMethod: NO_COMPRESSION,
    compressedSize: 0,
    uncompressedSize: 0,
    fileName: 'chrome/content/',
  } as Entry;

  class CrxTest extends Crx {
    _overrideCachedFilesForTests(files: Files) {
      this.files = files;
      // This marks the XPI as processed, i.e. the XPI has been read.
      this.processed = true;
    }
  }

  let fakeZipFile: ZipFile;
  let fakeZipLib: typeof yauzl;
  let fakeFs: typeof defaultFs;
  let parseCRXStub: jest.Mock;
  let openStub: jest.Mock;
  let fromBufferStub: jest.Mock;
  let readFileStub: jest.Mock;

  beforeEach(() => {
    fakeZipFile = createFakeZipFile();

    parseCRXStub = jest.fn();

    openStub = jest.fn();
    fromBufferStub = jest.fn();

    fakeZipLib = {
      ...yauzl,
      open: openStub,
      fromBuffer: fromBufferStub,
    };

    readFileStub = jest.fn();

    fakeFs = {
      ...defaultFs,
      // @ts-expect-error: TS complains about a `__promisify__` property but it
      // does not really matter.
      readFile: readFileStub,
    };
  });

  const createCrx = ({
    filePath = 'foo/bar',
    stderr = createFakeStderr(),
    zipLib = fakeZipLib,
    fs = defaultFs,
    parseCRX = defaultParseCRX,
  } = {}) => {
    return new CrxTest({ filePath, stderr, zipLib, fs, parseCRX });
  };

  describe('open()', () => {
    async function verifyCrxFixture(zipfile: ZipFile) {
      const results: Array<{ name: string; size: number }> = [];

      zipfile.on('entry', (entry: Entry) => {
        results.push({
          name: entry.fileName,
          size: entry.uncompressedSize,
        });
      });

      await new Promise((resolve) => {
        zipfile.on('end', resolve);
      });

      expect(results).toEqual([
        {
          name: 'manifest.json',
          size: 645,
        },
        {
          name: 'scripts/',
          size: 0,
        },
        {
          name: 'scripts/background.js',
          size: 16,
        },
      ]);
    }

    it('should open a CRX and return a zip', async () => {
      const myCrx = new Crx({
        filePath: 'src/tests/fixtures/io/extension.crx',
        stderr: createFakeStderr(),
      });

      const zipfile = await myCrx.open();

      expect(zipfile).toBeInstanceOf(ZipFile);
      await verifyCrxFixture(zipfile);
    });

    it('should open a CRX3 and return a zip', async () => {
      const myCrx = new Crx({
        filePath: 'src/tests/fixtures/io/crx3.crx',
        stderr: createFakeStderr(),
      });

      const zipfile = await myCrx.open();

      expect(zipfile).toBeInstanceOf(ZipFile);
      await verifyCrxFixture(zipfile);
    });

    it('should not accept a regular zip file as a CRX file', async () => {
      const notCrx = new Crx({
        filePath: 'src/tests/fixtures/io/simple-archive.zip',
        stderr: createFakeStderr(),
      });

      await expect(notCrx.open()).rejects.toThrow(
        'Invalid header: Does not start with Cr24.',
      );
    });

    it('should reject CRX4 files', async () => {
      const notCrx = createCrx({ fs: fakeFs });
      // CRX4 format does not exist yet. Reject files with such a header.
      // This is "Cr24" followed by the bytes 4 0 0 0.
      readFileStub.mockImplementation(
        (
          path: string,
          callback: (err: Error | null, data?: Buffer) => void,
        ) => {
          setImmediate(() =>
            callback(null, Buffer.from([67, 114, 50, 52, 4, 0, 0, 0])),
          );
        },
      );

      await expect(notCrx.open()).rejects.toThrow(
        'Unexpected crx format version number.',
      );
    });
  });

  describe('getFiles()', () => {
    let endStub: jest.Mock;
    let entryStub: jest.Mock;

    beforeEach(() => {
      endStub = jest.fn();
      entryStub = jest.fn();

      const onStub = jest.fn(
        (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'end') {
            endStub(callback);
          } else if (event === 'entry') {
            entryStub(callback);
          }
          return fakeZipFile;
        },
      );

      fakeZipFile = createFakeZipFile();
      fakeZipFile.on = onStub;
    });

    it('should init class props as expected', () => {
      const myCrx = createCrx({ filePath: 'foo/bar' });

      expect(myCrx.path).toEqual('foo/bar');
      expect(typeof myCrx.files).toEqual('object');
      expect(Object.keys(myCrx.files).length).toEqual(0);
    });

    it('should return cached data when available', async () => {
      const myCrx = createCrx({ filePath: 'foo/bar' });
      myCrx._overrideCachedFilesForTests({
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      });

      const files = await myCrx.getFiles();

      expect(files).toEqual(myCrx.files);
      expect(fromBufferStub).not.toHaveBeenCalled();
    });

    it('should contain expected files', async () => {
      const myCrx = createCrx({ fs: fakeFs, parseCRX: parseCRXStub });
      const expected = {
        'chrome.manifest': chromeManifestEntry,
      };

      readFileStub.mockImplementation(
        (
          path: string,
          callback: (err: Error | null, data?: Buffer) => void,
        ) => {
          setImmediate(() => callback(null, Buffer.from('bar')));
        },
      );
      parseCRXStub.mockReturnValue(Buffer.from('foo'));
      // Return the fake zip to the open callback.
      fromBufferStub.mockImplementation(
        (
          buffer: Buffer,
          callback: (err: Error | null, zipfile?: ZipFile) => void,
        ) => {
          setImmediate(() => callback(null, fakeZipFile));
        },
      );

      // If we could yield multiple times here we would but we need to manually
      // trigger callbacks since the stub is only invoked once (e.g. to init
      // the event handler).
      const onEventsSubscribed = () => {
        // Directly call the 'entry' event callback as if we are actually
        // processing entries in a zip.
        const entryCallback = entryStub.mock.calls[0][0];
        entryCallback.call(null, chromeManifestEntry);
        entryCallback.call(null, chromeContentDir);
      };

      // Call the close event callback.
      endStub.mockImplementation((callback: () => void) => {
        setImmediate(callback);
      });

      const files = await myCrx.getFiles(onEventsSubscribed);

      expect(files).toEqual(expected);
    });

    it('should reject on errors in readFile() in open()', async () => {
      const myCrx = createCrx({ fs: fakeFs });

      readFileStub.mockImplementation(
        (
          path: string,
          callback: (err: Error | null, data?: Buffer) => void,
        ) => {
          setImmediate(() => callback(new Error('open test'), undefined));
        },
      );

      await expect(myCrx.getFiles()).rejects.toThrow('open test');
    });

    it('should reject on errors in parseCRX() in open()', async () => {
      const myCrx = createCrx({ parseCRX: parseCRXStub, fs: fakeFs });

      readFileStub.mockImplementation(
        (
          path: string,
          callback: (err: Error | null, data?: Buffer) => void,
        ) => {
          setImmediate(() => callback(null, Buffer.from('bar')));
        },
      );
      parseCRXStub.mockImplementation(() => {
        throw new Error('open test');
      });

      await expect(myCrx.getFiles()).rejects.toThrow('open test');
    });

    it('should reject on errors in fromBuffer() in open()', async () => {
      const myCrx = createCrx({ parseCRX: parseCRXStub, fs: fakeFs });

      readFileStub.mockImplementation(
        (
          path: string,
          callback: (err: Error | null, data?: Buffer) => void,
        ) => {
          setImmediate(() => callback(null, Buffer.from('bar')));
        },
      );
      parseCRXStub.mockReturnValue(Buffer.from('foo'));
      fromBufferStub.mockImplementation(
        (
          buffer: Buffer,
          callback: (err: Error | null, zipfile?: ZipFile) => void,
        ) => {
          setImmediate(() => callback(new Error('open test'), fakeZipFile));
        },
      );

      await expect(myCrx.getFiles()).rejects.toThrow('open test');
    });
  });
});
