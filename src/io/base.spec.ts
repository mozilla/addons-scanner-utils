import { IOBase } from './base';
import { FLAGGED_FILE_MAGIC_NUMBERS_LENGTH } from './const';
import { createFakeStderr } from '../test-helpers';

describe(__filename, () => {
  const createIOBase = ({
    filepath = 'foo/bar/',
    stderr = createFakeStderr(),
  } = {}) => {
    return new IOBase({ filepath, stderr });
  };

  describe('IOBase()', () => {
    it('should init class props as expected', () => {
      const filepath = 'foo/not-bar';
      const io = createIOBase({ filepath });

      expect(io.path).toEqual(filepath);
      expect(io.entries.length).toEqual(0);
      expect(Object.keys(io.files).length).toEqual(0);
      expect(typeof io.files).toEqual('object');
      expect(io.maxSizeBytes).toEqual(104857600);
    });

    it('should reject calling getFiles()', async () => {
      const io = createIOBase();

      await expect(io.getFiles()).rejects.toThrow(
        'getFiles is not implemented',
      );
    });

    it('should reject calling getFileAsString()', async () => {
      const io = createIOBase();

      await expect(io.getFileAsString('file')).rejects.toThrow(
        'getFileAsString is not implemented',
      );
    });

    it('should reject calling getFileAsStream()', async () => {
      const io = createIOBase();

      await expect(io.getFileAsStream('file')).rejects.toThrow(
        'getFileAsStream is not implemented',
      );
    });

    it('should reject calling getChunkAsBuffer()', async () => {
      const io = createIOBase();
      const length = 123;

      await expect(io.getChunkAsBuffer('file', length)).rejects.toThrow(
        'getChunkAsBuffer is not implemented',
      );
    });

    it('should call getFileAsStream method via getFile()', () => {
      const io = createIOBase();
      io.getFileAsStream = jest.fn();
      io.getFile('get-a-stream', 'stream');
      expect(io.getFileAsStream).toHaveBeenCalledWith('get-a-stream');
    });

    it('should call getFileAsString method via getFile()', () => {
      const io = createIOBase();
      io.getFileAsString = jest.fn();
      io.getFile('get-a-string', 'string');
      expect(io.getFileAsString).toHaveBeenCalledWith('get-a-string');
    });

    it('should call getChunkAsBuffer method via getFile()', () => {
      const io = createIOBase();
      io.getChunkAsBuffer = jest.fn();
      io.getFile('get-a-chunk-as-buffer', 'chunk');
      expect(io.getChunkAsBuffer).toHaveBeenCalledWith(
        'get-a-chunk-as-buffer',
        FLAGGED_FILE_MAGIC_NUMBERS_LENGTH,
      );
    });

    it('should scan all files by default', () => {
      const io = createIOBase();
      expect(io.shouldScanFile('manifest.json', false)).toBeTruthy();
    });

    it('should allow configuration of which files can be scanned', () => {
      const io = createIOBase();
      expect(io.shouldScanFile('manifest.json', false)).toBeTruthy();
    });

    it('should ignore undefined scan file callbacks', () => {
      const io = createIOBase();
      // We ignore the TS error below because we want to test the guard that
      // prevents undefined callbacks.
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      io.setScanFileCallback(undefined);
      expect(io.shouldScanFile('manifest.json', false)).toBeTruthy();
    });

    it('should ignore a non-function scan file callback', () => {
      const io = createIOBase();
      // We ignore the TS error below because we want to test the guard that
      // prevents callbacks that are not functions.
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      io.setScanFileCallback(42); // this is not a function
      expect(io.shouldScanFile('manifest.json', false)).toBeTruthy();
    });
  });
});
