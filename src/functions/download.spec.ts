import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  DEFAULT_DOWNLOAD_FILENAME,
  DownloadFileError,
  downloadFileUpload,
} from './download';

describe(__filename, () => {
  describe('DownloadFileError', () => {
    it('creates an error with message', () => {
      const message = 'test error';
      const error = new DownloadFileError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toEqual('DownloadFileError');
      expect(error.message).toEqual(message);
      expect(error.status).toEqual(500);
      expect(error.extraInfo).not.toBeDefined();
    });

    it('creates an error with status', () => {
      const status = 404;
      const error = new DownloadFileError('not found', undefined, status);

      expect(error.status).toEqual(status);
    });

    it('creates an error with extra info', () => {
      const extraInfo = 'additional context';
      const error = new DownloadFileError('error', extraInfo, 500);

      expect(error.extraInfo).toEqual(extraInfo);
    });

    it('converts to ApiError', () => {
      const message = 'test error';
      const status = 400;
      const extraInfo = 'extra context';
      const error = new DownloadFileError(message, extraInfo, status);

      const apiError = error.toApiError();

      expect(apiError.message).toEqual(message);
      expect(apiError.status).toEqual(status);
      expect(apiError.extraInfo).toEqual(extraInfo);
    });

    it('converts to ApiError with default status', () => {
      const error = new DownloadFileError('test');

      const apiError = error.toApiError();

      expect(apiError.status).toEqual(500);
    });
  });

  describe('downloadFileUpload', () => {
    const allowedOrigin = 'https://addons.mozilla.org';
    const validURL = `${allowedOrigin}/upload/file.xpi`;

    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('throws DownloadFileError when origin is invalid', async () => {
      const invalidURL = 'https://evil.com/malicious.xpi';

      await expect(
        downloadFileUpload({ downloadURL: invalidURL, allowedOrigin, tmpDir }),
      ).rejects.toThrow(DownloadFileError);

      await expect(
        downloadFileUpload({ downloadURL: invalidURL, allowedOrigin, tmpDir }),
      ).rejects.toMatchObject({
        message: `download URL does not match allowed origin: ${allowedOrigin}`,
        status: 400,
      });
    });

    it('downloads a file successfully', async () => {
      const fileContent = 'test xpi content';
      const mockResponse = {
        ok: true,
        body: Readable.toWeb(Readable.from([Buffer.from(fileContent)])),
        status: 200,
        statusText: 'OK',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const filepath = await downloadFileUpload({
        downloadURL: validURL,
        allowedOrigin,
        tmpDir,
      });

      expect(filepath).toEqual(path.join(tmpDir, DEFAULT_DOWNLOAD_FILENAME));
      expect(fs.existsSync(filepath)).toBe(true);

      const downloadedContent = fs.readFileSync(filepath, 'utf-8');
      expect(downloadedContent).toEqual(fileContent);
      expect(global.fetch).toHaveBeenCalledWith(validURL);
    });

    it('can use a custom filename', async () => {
      const customFilename = 'custom.xpi';
      const mockResponse = {
        ok: true,
        body: Readable.toWeb(Readable.from([Buffer.from('content')])),
        status: 200,
        statusText: 'OK',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const filepath = await downloadFileUpload({
        downloadURL: validURL,
        allowedOrigin,
        tmpDir,
        filename: customFilename,
      });

      expect(filepath).toEqual(path.join(tmpDir, customFilename));
      expect(fs.existsSync(filepath)).toBe(true);
    });

    it('throws DownloadFileError when fetch fails', async () => {
      const mockResponse = {
        ok: false,
        body: null,
        status: 404,
        statusText: 'Not Found',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await expect(
        downloadFileUpload({ downloadURL: validURL, allowedOrigin, tmpDir }),
      ).rejects.toMatchObject({
        message: 'unexpected response: Not Found',
        status: 500,
      });
    });

    it('throws DownloadFileError when response has no body', async () => {
      const mockResponse = {
        ok: true,
        body: null,
        status: 200,
        statusText: 'OK',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await expect(
        downloadFileUpload({ downloadURL: validURL, allowedOrigin, tmpDir }),
      ).rejects.toMatchObject({
        message: 'unexpected response: OK',
        status: 500,
      });
    });

    it('throws DownloadFileError when network error occurs', async () => {
      const networkError = new Error('network timeout');
      global.fetch = jest.fn().mockRejectedValue(networkError);

      await expect(
        downloadFileUpload({ downloadURL: validURL, allowedOrigin, tmpDir }),
      ).rejects.toMatchObject({
        message: 'failed to download file',
        status: 500,
        extraInfo: 'network timeout',
      });
    });

    it('throws DownloadFileError when write fails', async () => {
      const invalidDir = '/invalid/nonexistent/directory';
      const mockResponse = {
        ok: true,
        body: Readable.toWeb(Readable.from([Buffer.from('content')])),
        status: 200,
        statusText: 'OK',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await expect(
        downloadFileUpload({
          downloadURL: validURL,
          allowedOrigin,
          tmpDir: invalidDir,
        }),
      ).rejects.toThrow(DownloadFileError);

      const error = await downloadFileUpload({
        downloadURL: validURL,
        allowedOrigin,
        tmpDir: invalidDir,
      }).catch((err) => err);

      expect(error.message).toEqual('failed to download file');
      expect(error.status).toEqual(500);
      expect(error.extraInfo).toBeDefined();
    });

    it('preserves DownloadFileError when re-thrown from catch', async () => {
      const mockResponse = {
        ok: false,
        body: null,
        status: 403,
        statusText: 'Forbidden',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const error = await downloadFileUpload({
        downloadURL: validURL,
        allowedOrigin,
        tmpDir,
      }).catch((err) => err);

      expect(error).toBeInstanceOf(DownloadFileError);
      expect(error.message).toEqual('unexpected response: Forbidden');
      expect(error.status).toEqual(500);
      // Should NOT have extraInfo since this is the original error, not wrapped
      expect(error.extraInfo).not.toBeDefined();
    });

    it('validates origin with exact prefix match', async () => {
      // Test that we don't allow similar but different origins...
      const similarOrigin = 'https://addons.mozilla.org.evil.com';
      const invalidURL = `${similarOrigin}/file.xpi`;

      await expect(
        downloadFileUpload({ downloadURL: invalidURL, allowedOrigin, tmpDir }),
      ).rejects.toMatchObject({
        message: `download URL does not match allowed origin: ${allowedOrigin}`,
        status: 400,
      });
    });

    it('uses default tmpdir/filename when not specified', async () => {
      const mockResponse = {
        ok: true,
        body: Readable.toWeb(Readable.from([Buffer.from('content')])),
        status: 200,
        statusText: 'OK',
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const filepath = await downloadFileUpload({
        downloadURL: validURL,
        allowedOrigin,
      });

      expect(filepath).toEqual(
        path.join(os.tmpdir(), DEFAULT_DOWNLOAD_FILENAME),
      );
      expect(fs.existsSync(filepath)).toBe(true);

      fs.unlinkSync(filepath);
    });
  });
});
