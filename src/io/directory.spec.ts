import { Readable } from 'stream';
import { EventEmitter } from 'events';

import { Directory } from './directory';
import { createFakeStderr, readStringFromStream } from '../test-helpers';

describe(__filename, () => {
  const fakeFile = {
    size: 123,
  };

  const createDirectory = ({
    filePath = 'src/tests/fixtures/io/',
    stderr = createFakeStderr(),
  } = {}) => {
    return new Directory({ filePath, stderr });
  };

  describe('Directory.getFiles()', () => {
    it('should return cached data when available', async () => {
      const myDirectory = createDirectory();
      const fakeFileMeta = {
        ...fakeFile,
        size: 1,
      };
      myDirectory.files = {
        'manifest.json': fakeFileMeta,
        'chrome.manifest': fakeFileMeta,
      };

      const fakeWalkPromise = jest.fn();

      const files = await myDirectory.getFiles(fakeWalkPromise);
      expect(files).toEqual(myDirectory.files);
      expect(fakeWalkPromise).not.toHaveBeenCalled();
    });

    it('should return files from fixtures', async () => {
      const myDirectory = createDirectory();

      const files = await myDirectory.getFiles();
      const fileNames = Object.keys(files);
      expect(fileNames).toContain('dir1/file1.txt');
      expect(fileNames).toContain('dir2/file2.txt');
      expect(fileNames).toContain('dir2/dir3/file3.txt');
    });

    it('can be configured to not scan file paths', async () => {
      const myDirectory = createDirectory();
      myDirectory.setScanFileCallback((filePath) => {
        return !filePath.startsWith('dir2');
      });

      const files = await myDirectory.getFiles();
      const fileNames = Object.keys(files);
      expect(fileNames).toContain('dir1/file1.txt');
      expect(fileNames).not.toContain('dir2/file2.txt');
      expect(fileNames).not.toContain('dir2/dir3/file3.txt');
    });

    it('can be configured to scan all dirs and to include a single file', async () => {
      const myDirectory = createDirectory();
      myDirectory.setScanFileCallback((filePath, isDir) => {
        if (isDir) {
          return true;
        }
        return filePath === 'dir2/dir3/file3.txt';
      });

      const files = await myDirectory.getFiles();
      const fileNames = Object.keys(files);
      expect(fileNames).not.toContain('dir1/file1.txt');
      expect(fileNames).not.toContain('dir2/file2.txt');
      expect(fileNames).toContain('dir2/dir3/file3.txt');
    });
  });

  describe('getPath()', () => {
    it('should reject if not a file that exists', async () => {
      const myDirectory = createDirectory();

      await myDirectory.getFiles();
      await expect(myDirectory.getPath('whatever')).rejects.toThrow(
        '"whatever" does not exist in this dir.',
      );
    });

    it('should reject if path does not start with base', async () => {
      const myDirectory = createDirectory();
      myDirectory.files = {
        '../file1.txt': { ...fakeFile },
      };

      await expect(myDirectory.getPath('../file1.txt')).rejects.toThrow(
        'Path argument must be relative',
      );
    });

    it("should reject if path starts with '/'", async () => {
      const myDirectory = createDirectory();
      myDirectory.files = {
        '/file1.txt': { ...fakeFile },
      };

      await expect(myDirectory.getPath('/file1.txt')).rejects.toThrow(
        'Path argument must be relative',
      );
    });
  });

  describe('getFileAsStream()', () => {
    it('should return a stream', async () => {
      const myDirectory = createDirectory();
      await myDirectory.getFiles();

      const readStream = await myDirectory.getFileAsStream(
        'dir2/dir3/file3.txt',
      );

      await expect(readStringFromStream(readStream, undefined)).resolves.toBe(
        '123\n',
      );
    });

    it('should not enforce utf-8 when encoding = null', async () => {
      const myDirectory = createDirectory();
      await myDirectory.getFiles();

      const readStreamEncodingDefault = await myDirectory.getFileAsStream(
        'dir2/dir3/file.png',
      );

      const readStreamEncodingNull = await myDirectory.getFileAsStream(
        'dir2/dir3/file.png',
        {
          encoding: '',
        },
      );

      const stringFromEncodingDefault = await readStringFromStream(
        readStreamEncodingDefault,
        'binary',
      );
      const stringFromEncodingNull = await readStringFromStream(
        readStreamEncodingNull,
        'binary',
      );

      // Ensure that by setting the encoding to null, the utf-8 encoding is not enforced
      // while reading binary data from the stream.
      expect(stringFromEncodingNull.slice(0, 8)).toEqual('\x89PNG\r\n\x1a\n');

      // Confirms that the default "utf-8" encoding behavior is still preserved when the encoding
      // is not been explicitly specified.
      expect(stringFromEncodingDefault.slice(0, 8)).not.toEqual(
        '\x89PNG\r\n\x1a\n',
      );
    });

    it('should reject if file is too big', async () => {
      const myDirectory = createDirectory();
      const fakeFileMeta = {
        size: 1024 * 1024 * 102,
      };
      myDirectory.files = {
        'manifest.json': fakeFileMeta,
        'chrome.manifest': fakeFileMeta,
      };

      await expect(
        myDirectory.getFileAsStream('manifest.json'),
      ).rejects.toThrow('File "manifest.json" is too large');
    });
  });

  describe('getFileAsString()', () => {
    it('should strip a BOM', async () => {
      const myDirectory = createDirectory();

      await myDirectory.getFiles();
      const content = await myDirectory.getFileAsString('dir3/foo.txt');
      expect(content.charCodeAt(0)).not.toEqual(0xfeff);
    });

    it('should return a string', async () => {
      const myDirectory = createDirectory();

      await myDirectory.getFiles();
      await expect(
        myDirectory.getFileAsString('dir2/dir3/file3.txt'),
      ).resolves.toBe('123\n');
    });

    it('should reject if stream emits error', async () => {
      const fakeStreamEmitter = new EventEmitter() as Readable;

      const myDirectory = createDirectory();
      myDirectory.files = {
        'manifest.json': { ...fakeFile },
        'chrome.manifest': { ...fakeFile },
      };

      myDirectory.getFileAsStream = () => {
        setTimeout(() => {
          fakeStreamEmitter.emit('error', new Error('¡hola!'));
        }, 0);
        return Promise.resolve(fakeStreamEmitter);
      };

      await expect(
        myDirectory.getFileAsString('manifest.json'),
      ).rejects.toThrow('¡hola!');
    });

    it('should reject if file is too big', async () => {
      const myDirectory = createDirectory();
      const fakeFileMeta = {
        size: 1024 * 1024 * 102,
      };
      myDirectory.files = {
        'manifest.json': fakeFileMeta,
        'chrome.manifest': fakeFileMeta,
      };

      await expect(
        myDirectory.getFileAsString('manifest.json'),
      ).rejects.toThrow('File "manifest.json" is too large');
    });
  });

  // Using a file located in: src/tests/fixtures/io/dir2/dir3/file3.txt
  // The location is not relevant, the file contents are.
  describe('getChunkAsBuffer()', () => {
    it('should get a buffer', async () => {
      const myDirectory = createDirectory();

      await myDirectory.getFiles();
      // Just grab the first two characters.
      const buffer = await myDirectory.getChunkAsBuffer(
        'dir2/dir3/file3.txt',
        2,
      );
      // The file contains: 123\n. This tests that we are getting just
      // the first two characters in the buffer.
      expect(buffer.toString()).toEqual('12');
    });

    it('rejects when stream emits an error', async () => {
      const myDirectory = createDirectory();
      // Override `getPath` so that `createReadStream()` can emit an error.
      myDirectory.getPath = async (_path: string) => Promise.resolve(_path);

      const file = 'some-file';

      await expect(myDirectory.getChunkAsBuffer(file, 2)).rejects.toThrow(
        new RegExp(`ENOENT: no such file or directory, open '${file}'`),
      );
    });
  });
});
