import fs from 'fs';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import yauzl, { Entry, Options, ZipFile } from 'yauzl';

import { Xpi } from './xpi';
import { DEFLATE_COMPRESSION, NO_COMPRESSION } from './const';
import {
  createFakeStderr,
  createFakeZipFile,
  readStringFromStream,
} from '../test-helpers';

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

  const dupeInstallFileEntry = {
    ...defaultData,
    compressedSize: 416,
    uncompressedSize: 851,
    fileName: 'manifest.json',
  } as Entry;

  const jsMainFileEntry = {
    ...defaultData,
    compressedSize: 41,
    uncompressedSize: 85,
    fileName: 'main.js',
  } as Entry;

  const jsSecondaryFileEntry = {
    ...defaultData,
    compressedSize: 456,
    uncompressedSize: 851,
    fileName: 'secondary.js',
  } as Entry;

  const chromeContentDir = {
    compressionMethod: NO_COMPRESSION,
    compressedSize: 0,
    uncompressedSize: 0,
    fileName: 'chrome/content/',
  };

  let fakeZipFile: ZipFile;
  let fakeZipLib: typeof yauzl;

  beforeEach(() => {
    jest.clearAllMocks();

    fakeZipFile = createFakeZipFile();

    fakeZipLib = {
      ...yauzl,
    };
  });

  const createXpi = ({
    autoClose = true,
    filePath = 'foo/bar',
    stderr = createFakeStderr(),
    zipLibOpen = jest.fn(),
  } = {}) => {
    return new Xpi({
      filePath,
      autoClose,
      stderr,
      zipLib: {
        ...fakeZipLib,

        open: zipLibOpen,
      },
    });
  };

  // TypeScript types used by the function right below them (`getMockImplementationFor`).
  type ZipLibOpenType = (
    path: string,
    options: Options,
    callback?: (err?: Error, zipfile?: ZipFile) => void,
  ) => void;
  type ZipLibOpenCallbackType = Parameters<ZipLibOpenType>[2];
  type ZipLibOpenCallbackParametersType = Parameters<
    NonNullable<ZipLibOpenCallbackType>
  >;
  type OpenReadStreamType = ZipFile['openReadStream'];
  type OpenReadStreamCallbackType = Parameters<OpenReadStreamType>[1];
  type OpenReadStreamCallbackParametersType =
    Parameters<OpenReadStreamCallbackType>;

  /** Returns a mock function that invokes the callback provided to it
   * with `argsToProvideToCallback` as arguments.
   */
  function getMockImplementationFor(
    forFunction: 'open',
    ...argsToProvideToCallback: ZipLibOpenCallbackParametersType
  ): jest.Mock<void, Parameters<ZipLibOpenType>>;
  function getMockImplementationFor(
    forFunction: 'openReadStream',
    ...argsToProvideToCallback: OpenReadStreamCallbackParametersType
  ): OpenReadStreamType;

  function getMockImplementationFor<
    ForFunction extends 'open' | 'openReadStream',
  >(
    forFunction: ForFunction,

    ...argsToProvideToCallback: ForFunction extends 'open'
      ? ZipLibOpenCallbackParametersType
      : OpenReadStreamCallbackParametersType
  ) {
    if (forFunction === 'open') {
      /** Mock function for `zipLib.open`. */
      const mockOpen = jest.fn<void, Parameters<ZipLibOpenType>>(
        (_, __, callback): void => {
          if (typeof callback === 'function') {
            // Invoke the callback with the desired arguments.
            callback(
              ...(argsToProvideToCallback as ZipLibOpenCallbackParametersType),
            );
          }
        },
      );

      return mockOpen;
    }

    /** Mock function for `zipfile.openReadStream`. */
    const mockOpenReadStream: jest.Mock<void, Parameters<OpenReadStreamType>> =
      jest.fn((_, callback): void => {
        if (typeof callback === 'function') {
          // Invoke the callback with the desired arguments.
          callback(
            ...(argsToProvideToCallback as OpenReadStreamCallbackParametersType),
          );
        }
      });

    return mockOpenReadStream as unknown as OpenReadStreamType;
  }

  describe('open()', () => {
    it('should resolve with zipfile', async () => {
      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });

      const result = await myXpi.open();

      expect(result).toEqual(fakeZipFile);
    });

    it('should reject on error', async () => {
      const errorMessage = 'open() test error';
      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', new Error(errorMessage)),
      });

      await expect(myXpi.open()).rejects.toThrow(errorMessage);
    });

    it('reuses the zipfile if it is still open and autoClose is disabled', async () => {
      const openZipFile = createFakeZipFile();
      openZipFile.isOpen = true;

      const mockZipLibOpen = getMockImplementationFor(
        'open',
        undefined,
        openZipFile,
      );

      const myXpi = createXpi({
        autoClose: false,
        zipLibOpen: mockZipLibOpen,
      });

      // Open the zipfile.
      let result = await myXpi.open();

      expect(mockZipLibOpen).toHaveBeenCalled();
      expect(result).toStrictEqual(openZipFile);

      // Clean up the mock's usage data, as if the mock had never been called at all.
      mockZipLibOpen.mockClear();

      result = await myXpi.open();

      expect(mockZipLibOpen).not.toHaveBeenCalled();
      expect(result).toStrictEqual(openZipFile);
    });

    it('does not reuse the zipfile if autoClose is disabled and the file is closed', async () => {
      const closedZipFile = createFakeZipFile();
      closedZipFile.isOpen = false;

      const mockZipLibOpen = getMockImplementationFor(
        'open',
        undefined,
        closedZipFile,
      );

      const myXpi = createXpi({
        autoClose: false,
        zipLibOpen: mockZipLibOpen,
      });
      let result = await myXpi.open();

      expect(mockZipLibOpen).toHaveBeenCalled();
      expect(result).toStrictEqual(closedZipFile);

      mockZipLibOpen.mockClear();
      result = await myXpi.open();

      expect(mockZipLibOpen).toHaveBeenCalledTimes(1);
      expect(result).toEqual(closedZipFile);
    });

    it('does not reuse the zipfile if it is still open but autoClose is enabled', async () => {
      const openZipFile = createFakeZipFile();
      openZipFile.isOpen = true;

      const mockZipLibOpen = getMockImplementationFor(
        'open',
        undefined,
        openZipFile,
      );

      const myXpi = createXpi({
        autoClose: true,
        zipLibOpen: mockZipLibOpen,
      });
      let result = await myXpi.open();

      expect(mockZipLibOpen).toHaveBeenCalled();
      expect(result).toStrictEqual(openZipFile);

      mockZipLibOpen.mockClear();
      result = await myXpi.open();

      expect(mockZipLibOpen).toHaveBeenCalledTimes(1);
      expect(result).toEqual(openZipFile);
    });
  });

  describe('getFiles()', () => {
    let mockEntryEventListener: ReturnType<typeof jest.fn>;
    let mockEndEventListener: ReturnType<typeof jest.fn>;

    beforeEach(() => {
      // Mock the zipfile's event listeners.
      mockEntryEventListener =
        jest.fn<void, ['entry', (entry: Entry) => void]>();

      mockEndEventListener = jest.fn((_: 'end', callback: () => void): void => {
        // Invoke the provided callback, to resolve the Promise returned by `getFiles`.
        callback();
      });

      // Mock the event listeners. With these mocks we can assert that an event was emitted.
      fakeZipFile.on = jest.fn(
        (
          eventName: string,
          callback: (...args: unknown[]) => unknown,
        ): ZipFile => {
          if (eventName === 'entry') {
            mockEntryEventListener(eventName, callback);
          } else if (eventName === 'end') {
            mockEndEventListener(eventName, callback);
          }

          return null as unknown as ZipFile;
        },
      );
    });

    it('should init class props as expected', () => {
      const filePath = 'foo/bar';
      const myXpi = createXpi({ filePath });

      expect(myXpi.path).toEqual(filePath);
      expect(typeof myXpi.files).toEqual('object');
      expect(Object.keys(myXpi.files).length).toEqual(0);
    });

    it('should return cached data when available', async () => {
      const mockZipLibOpen = jest.fn();

      const myXpi = createXpi({
        zipLibOpen: mockZipLibOpen,
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      await expect(myXpi.getFiles()).resolves.toEqual(myXpi.files);
      expect(mockZipLibOpen).not.toHaveBeenCalled();
    });

    it('should contain expected files', async () => {
      // Save original mock implementation.
      const temp = mockEntryEventListener;

      // Assign mock tailored to the test case.
      mockEntryEventListener = jest.fn(
        (_: 'entry', callback: (entry: Entry) => void) => {
          // Directly call the 'entry' event callback as if
          // we are actually processing entries in a
          // zip.
          callback(chromeManifestEntry);
          callback(chromeContentDir as Entry);
          callback(installFileEntry);
        },
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      const expected = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      await expect(myXpi.getFiles()).resolves.toStrictEqual(expected);

      // Restore the original mock implementation.
      mockEntryEventListener = temp;
    });

    it('can be configured to exclude files', async () => {
      // Save original mock implementation.
      const temp = mockEntryEventListener;

      // Assign mock tailored to the test case.
      mockEntryEventListener = jest.fn(
        (_: 'entry', callback: (entry: Entry) => void) => {
          // Directly call the 'entry' event callback as if
          // we are actually processing entries in a
          // zip.
          callback(chromeManifestEntry);
          callback(chromeContentDir as Entry);
          callback(installFileEntry);
        },
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.setScanFileCallback((filePath) => {
        return !/manifest\.json/.test(filePath);
      });

      const files = await myXpi.getFiles();

      expect(files['chrome.manifest']).toEqual(chromeManifestEntry);
      expect(files['manifest.json']).not.toBeDefined();

      // Restore the original mock implementation.
      mockEntryEventListener = temp;
    });

    it('can be configured to exclude files when cached', async () => {
      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });

      // Populate the file cache:
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };
      myXpi.setScanFileCallback((filePath) => {
        return !/manifest\.json/.test(filePath);
      });

      const files = await myXpi.getFiles();

      expect(files['chrome.manifest']).toEqual(chromeManifestEntry);
      expect(files['manifest.json']).not.toBeDefined();
    });

    it('should reject on duplicate entries', async () => {
      // Save original mock implementation.
      const temp = mockEntryEventListener;

      // Assign mock tailored to the test case.
      mockEntryEventListener = jest.fn(
        (_: 'entry', callback: (entry: Entry) => void) => {
          // Directly call the 'entry' event callback as if
          // we are actually processing entries in a
          // zip.
          callback(installFileEntry);
          callback(dupeInstallFileEntry);
        },
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });

      await expect(myXpi.getFiles()).rejects.toThrow('DuplicateZipEntry');

      // Restore the original mock implementation.
      mockEntryEventListener = temp;
    });

    it('should reject on errors in open()', async () => {
      const errorMessage = 'open test';

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor(
          'open',
          new Error(errorMessage),
          fakeZipFile,
        ),
      });

      await expect(myXpi.getFiles()).rejects.toThrow(errorMessage);
    });

    it('throws an exception when a duplicate entry has been found', async () => {
      const xpi = new Xpi({
        filePath: 'src/tests/fixtures/io/archive-with-duplicate-files.zip',
        stderr: createFakeStderr(),
      });

      await expect(xpi.getFiles()).rejects.toThrow('DuplicateZipEntry');
    });

    it('throws an exception when a duplicate entry has been found, even when autoClose is disabled', async () => {
      const xpi = new Xpi({
        autoClose: false,
        filePath: 'src/tests/fixtures/io/archive-with-duplicate-files.zip',
        stderr: createFakeStderr(),
      });

      await expect(xpi.getFiles()).rejects.toThrow('DuplicateZipEntry');

      xpi.close();
    });
  });

  describe('getFile()', () => {
    it('should throw if fileStreamType is incorrect', () => {
      const myXpi = createXpi();

      expect(() => {
        // @ts-expect-error: we test the guard that prevents an invalid second argument value.
        myXpi.getFile('whatever-file', 'whatever');
      }).toThrow('Unexpected fileStreamType value "whatever"');
    });

    it('should call getFileAsString', () => {
      const myXpi = createXpi();
      const fakeFile = 'fakeFile';
      myXpi.getFileAsString = jest.fn();
      myXpi.getFile(fakeFile, 'string');

      expect(myXpi.getFileAsString).toHaveBeenCalledWith(fakeFile);
    });

    it('should call getFileAsStream', () => {
      const myXpi = createXpi();
      const fakeFile = 'fakeFile';
      myXpi.getFileAsStream = jest.fn();
      myXpi.getFile(fakeFile, 'stream');

      expect(myXpi.getFileAsStream).toHaveBeenCalledWith(fakeFile);
    });
  });

  describe('checkPath()', () => {
    it('should reject if path does not exist', async () => {
      const myXpi = createXpi();
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      await expect(myXpi.getFileAsStream('whatever')).rejects.toThrow(
        'Path "whatever" does not exist',
      );
    });

    it('should reject if file is too big', async () => {
      const myXpi = createXpi();
      const fakeFileMeta = {
        uncompressedSize: 1024 * 1024 * 102,
      } as Entry;

      myXpi.files = {
        'manifest.json': fakeFileMeta,
        'chrome.manifest': fakeFileMeta,
      };

      await expect(myXpi.getFileAsStream('manifest.json')).rejects.toThrow(
        'File "manifest.json" is too large',
      );
    });

    it('should reject if file is too big for getFileAsString too', async () => {
      const myXpi = createXpi();
      const fakeFileMeta = {
        uncompressedSize: 1024 * 1024 * 102,
      } as Entry;

      myXpi.files = {
        'manifest.json': fakeFileMeta,
        'chrome.manifest': fakeFileMeta,
      };

      await expect(myXpi.getFileAsString('manifest.json')).rejects.toThrow(
        'File "manifest.json" is too large',
      );
    });
  });

  // Using a file located in: src/tests/fixtures/io/dir2/dir3/file3.txt
  // The location is not relevant, the file contents are.
  describe('getChunkAsBuffer()', () => {
    it('should reject if error in openReadStream', async () => {
      const errorMessage = 'getChunkAsBuffer openReadStream test';

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        new Error(errorMessage),
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
      };

      const chunkLength = 123;

      await expect(
        myXpi.getChunkAsBuffer('manifest.json', chunkLength),
      ).rejects.toThrow(errorMessage);
    });

    it('should resolve with a buffer', async () => {
      const rstream = new Readable();
      rstream.push('123\n');
      rstream.push(null);

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        undefined,
        rstream,
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
      };

      // Just grab the first two characters.
      const buffer = await myXpi.getChunkAsBuffer('manifest.json', 2);

      // The file contains: 123\n. This tests that we are getting just
      // the first two characters in the buffer.
      expect(buffer.toString()).toEqual('12');
    });
  });

  describe('getFileAsStream()', () => {
    it('should reject if error in openReadStream', async () => {
      const errorMessage = 'getFileAsStream openReadStream test';

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        new Error(errorMessage),
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      await expect(myXpi.getFileAsStream('manifest.json')).rejects.toThrow(
        errorMessage,
      );
    });

    it('should resolve with a readable stream', async () => {
      const rstream = new Readable();
      rstream.push('line one\n');
      rstream.push('line two');
      rstream.push(null);

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        undefined,
        rstream,
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      const readStream = await myXpi.getFileAsStream('manifest.json');

      const encoding = undefined;
      const chunks = await readStringFromStream(readStream, encoding);
      const [chunk1, chunk2] = chunks.split('\n');

      expect(chunk1).toEqual('line one');
      expect(chunk2).toEqual('line two');
    });

    it('should resolve with a string', async () => {
      const rstream = new Readable();
      rstream.push('line one\n');
      rstream.push('line two');
      rstream.push(null);

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        undefined,
        rstream,
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      await expect(myXpi.getFileAsString('manifest.json')).resolves.toBe(
        'line one\nline two',
      );
    });

    it('should strip a BOM', async () => {
      const rstream = fs.createReadStream('src/tests/fixtures/io/dir3/foo.txt');

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        undefined,
        rstream,
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      const string = await myXpi.getFileAsString('manifest.json');
      expect(string.charCodeAt(0) === 0xfeff).toBeFalsy();
    });

    it('should reject if error in openReadStream from readAsString', async () => {
      const errorMessage = 'getFileAsString openReadStream test';

      fakeZipFile.openReadStream = getMockImplementationFor(
        'openReadStream',
        new Error(errorMessage),
      );

      const myXpi = createXpi({
        zipLibOpen: getMockImplementationFor('open', undefined, fakeZipFile),
      });
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      await expect(myXpi.getFileAsString('manifest.json')).rejects.toThrow(
        errorMessage,
      );
    });

    it('should reject if stream emits error', async () => {
      const fakeStreamEmitter = new EventEmitter() as Readable;
      const errorMessage = '¡hola!';

      const myXpi = createXpi();
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
      };

      myXpi.getFileAsStream = () => {
        setTimeout(() => {
          fakeStreamEmitter.emit('error', new Error(errorMessage));
        }, 0);
        return Promise.resolve(fakeStreamEmitter);
      };

      await expect(myXpi.getFileAsString('manifest.json')).rejects.toThrow(
        errorMessage,
      );
    });
  });

  describe('getFilesByExt()', () => {
    it('should return all JS files', async () => {
      const myXpi = createXpi();
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
        'main.js': jsMainFileEntry,
        'secondary.js': jsSecondaryFileEntry,
      };

      const jsFiles = await myXpi.getFilesByExt('.js');
      expect(jsFiles.length).toEqual(2);
      expect(jsFiles[0]).toEqual('main.js');
      expect(jsFiles[1]).toEqual('secondary.js');

      for (let i = 0; i < jsFiles.length; i++) {
        expect(jsFiles[i].endsWith('.js')).toBeTruthy();
      }
    });

    it('should return all CSS files', async () => {
      const myXpi = createXpi();
      myXpi.files = {
        'other.css': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
        'styles.css': jsMainFileEntry,
        'secondary.js': jsSecondaryFileEntry,
      };

      const cssFiles = await myXpi.getFilesByExt('.css');
      expect(cssFiles.length).toEqual(2);
      expect(cssFiles[0]).toEqual('other.css');
      expect(cssFiles[1]).toEqual('styles.css');

      for (let i = 0; i < cssFiles.length; i++) {
        expect(cssFiles[i].endsWith('.css')).toBeTruthy();
      }
    });

    it('should return all HTML files', async () => {
      const myXpi = createXpi();
      myXpi.files = {
        'manifest.json': installFileEntry,
        'chrome.manifest': chromeManifestEntry,
        'index.html': jsMainFileEntry,
        'second.htm': jsMainFileEntry,
        'third.html': jsMainFileEntry,
        'secondary.js': jsSecondaryFileEntry,
      };

      const htmlFiles = await myXpi.getFilesByExt('.html', '.htm');
      expect(htmlFiles.length).toEqual(3);
      expect(htmlFiles[0]).toEqual('index.html');
      expect(htmlFiles[1]).toEqual('second.htm');
      expect(htmlFiles[2]).toEqual('third.html');

      for (let i = 0; i < htmlFiles.length; i++) {
        expect(
          htmlFiles[i].endsWith('.html') || htmlFiles[i].endsWith('.htm'),
        ).toBeTruthy();
      }
    });

    it("should throw if file extension doesn't start with '.'", async () => {
      const myXpi = createXpi();

      await expect(myXpi.getFilesByExt('css')).rejects.toThrow(
        'File extension must start with',
      );
    });
  });

  describe('close()', () => {
    it('closes the zipfile when autoClose is disabled', async () => {
      const xpi = new Xpi({
        autoClose: false,
        filePath: 'src/tests/fixtures/io/simple-archive.zip',
        stderr: createFakeStderr(),
      });

      expect(xpi.zipfile).not.toBeDefined();

      // This is used to trigger a call to `open()` using the public API.
      await xpi.getFiles();

      // `zipfile` is created when `getFiles()` is called.
      expect(xpi.zipfile).toBeDefined();
      expect(xpi.zipfile && xpi.zipfile.isOpen).toEqual(true);

      xpi.close();

      expect(xpi.zipfile && xpi.zipfile.isOpen).toEqual(false);
    });

    it('does nothing when autoClose is enabled', () => {
      const xpi = new Xpi({
        autoClose: true,
        filePath: '',
        stderr: createFakeStderr(),
      });

      xpi.zipfile = createFakeZipFile();
      xpi.zipfile.close = jest.fn();

      expect(xpi.zipfile.close).not.toHaveBeenCalled();
    });
  });
});
