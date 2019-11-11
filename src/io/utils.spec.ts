import { WalkPromiseOptions, checkFileExists, walkPromise } from './utils';
import { createFakeFsStats, createFakeStderr } from '../test-helpers';

describe(__filename, () => {
  describe('walkPromise()', () => {
    const _walkPromise = ({
      path = 'src/tests/fixtures/io/',
      shouldIncludePath,
    }: { path?: string } & Partial<WalkPromiseOptions> = {}) => {
      return walkPromise(path, {
        shouldIncludePath,
        stderr: createFakeStderr(),
      });
    };

    it('should return the correct file data', async () => {
      const files = await _walkPromise();
      const fileNames = Object.keys(files);
      expect(fileNames).toContain('dir1/file1.txt');
      expect(fileNames).toContain('dir2/file2.txt');
      expect(fileNames).toContain('dir2/dir3/file3.txt');
    });

    it('should return the correct size data', async () => {
      const files = await _walkPromise();
      expect(files['dir1/file1.txt'].size).toEqual(2);
      expect(files['dir2/file2.txt'].size).toEqual(3);
      expect(files['dir2/dir3/file3.txt'].size).toEqual(4);
    });

    it('can be configured to not walk a directory', async () => {
      const files = await _walkPromise({
        shouldIncludePath: (filePath) => {
          return !filePath.startsWith('dir2');
        },
      });
      const fileNames = Object.keys(files);
      expect(fileNames).toContain('dir1/file1.txt');
      expect(fileNames).not.toContain('dir2/file2.txt');
      expect(fileNames).not.toContain('dir2/dir3/file3.txt');
    });

    it('can be configured to not include a file', async () => {
      const files = await _walkPromise({
        shouldIncludePath: (filePath) => {
          return filePath !== 'dir2/file2.txt';
        },
      });
      const fileNames = Object.keys(files);
      expect(fileNames).not.toContain('dir2/file2.txt');
      expect(fileNames).toContain('dir2/dir3/file3.txt');
    });

    it('can exclude the topmost directory', async () => {
      const files = await _walkPromise({
        shouldIncludePath: (filePath) => {
          // This would be the topmost directory.
          return filePath !== '';
        },
      });
      const fileNames = Object.keys(files);
      expect(fileNames).toEqual([]);
    });
  });

  describe('checkFileExists()', () => {
    it('throws an error if the file is not a directory or a file', async () => {
      const _lstat = jest.fn().mockReturnValue(
        createFakeFsStats({
          isDirectory: false,
          isFile: false,
        }),
      );
      const nonExistentFile = 'non-existent.js';

      await expect(
        checkFileExists(nonExistentFile, { _lstat }),
      ).rejects.toThrow(/is not a file or directory/);
    });

    it('throws an error if lstat() throws an ENOENT error', async () => {
      const error = new Error('some error') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      const _lstat = jest.fn().mockReturnValue(Promise.reject(error));

      await expect(checkFileExists('some-file.js', { _lstat })).rejects.toThrow(
        /is not a file or directory/,
      );
    });

    it('re-throws the lstat() error if it throws an error with a code different than ENOENT', async () => {
      const error = new Error('some error') as NodeJS.ErrnoException;
      error.code = 'OTHER_CODE';
      const _lstat = jest.fn().mockReturnValue(Promise.reject(error));

      await expect(checkFileExists('some-file.js', { _lstat })).rejects.toThrow(
        error,
      );
    });

    it('does not throw if the filepath is a valid file', async () => {
      const _lstat = jest
        .fn()
        .mockReturnValue(createFakeFsStats({ isFile: true }));

      await checkFileExists('some-file.js', { _lstat });
    });

    it('does not throw if the filepath is a valid directory', async () => {
      const _lstat = jest
        .fn()
        .mockReturnValue(createFakeFsStats({ isDirectory: true }));

      await checkFileExists('some-directory/', { _lstat });
    });
  });
});
