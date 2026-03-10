import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

import { createApiError } from './api';
import { makeJWT, MakeJWTConfig } from './auth';

export const DEFAULT_DOWNLOAD_FILENAME = 'input.xpi';

/**
 * Error thrown when file download operations fail.
 *
 * @property status - HTTP status code
 * @property extraInfo - Additional error details
 */
export class DownloadFileError extends Error {
  status: number;

  extraInfo?: string;

  constructor(message: string, extraInfo?: string, status: number = 500) {
    super(message);

    this.name = 'DownloadFileError';
    this.status = status;
    this.extraInfo = extraInfo;
  }

  /**
   * Convert this error to ApiError format.
   */
  toApiError() {
    return createApiError({
      message: this.message,
      extraInfo: this.extraInfo,
      status: this.status,
    });
  }
}

const fetchToFile = async (
  downloadURL: string,
  tmpDir: string,
  filename: string,
  headers?: HeadersInit,
): Promise<string> => {
  try {
    const response = await fetch(downloadURL, { headers });

    if (!response.ok || !response.body) {
      throw new DownloadFileError(
        `unexpected response: ${response.statusText}`,
      );
    }

    const filepath = path.join(tmpDir, filename);
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(filepath),
    );

    return filepath;
  } catch (err: unknown) {
    if (err instanceof DownloadFileError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new DownloadFileError('failed to download file', message);
  }
};

/**
 * Parameters for downloading a file from the AMO API with JWT authentication.
 *
 * @property downloadURL - URL to download from
 * @property tmpDir - Temporary directory for download (default: os.tmpdir())
 * @property filename - Downloaded file name (default: 'input.xpi')
 */
export type DownloadFileParams = MakeJWTConfig & {
  downloadURL: string;
  tmpDir?: string;
  filename?: string;
};

/**
 * Download a file from the AMO API, authenticating with a JWT token computed
 * from the `AMO_JWT_ISS_KEY` and `AMO_JWT_SECRET` environment variables.
 *
 * @returns Promise resolving to the file path of the downloaded file
 * @throws DownloadFileError if the download fails
 */
export const downloadFile = async ({
  downloadURL,
  tmpDir = os.tmpdir(),
  filename = DEFAULT_DOWNLOAD_FILENAME,
  env,
}: DownloadFileParams): Promise<string> => {
  const token = makeJWT({ env });

  return fetchToFile(downloadURL, tmpDir, filename, {
    Authorization: `JWT ${token}`,
  });
};

/**
 * Parameters for downloading a file upload.
 *
 * @property downloadURL - URL to download from
 * @property allowedOrigin - Allowed origin for the download URL
 * @property tmpDir - Temporary directory for download (default: os.tmpdir())
 * @property filename - Downloaded file name (default: 'input.xpi')
 */
export type DownloadFileUploadParams = {
  downloadURL: string;
  allowedOrigin: string;
  tmpDir?: string;
  filename?: string;
};

/**
 * Download a file from a URL to a temporary location.
 *
 * @returns Promise resolving to the file path of the downloaded file
 * @throws DownloadFileError if the download fails or URL origin doesn't match
 */
export const downloadFileUpload = async ({
  downloadURL,
  allowedOrigin,
  tmpDir = os.tmpdir(),
  filename = DEFAULT_DOWNLOAD_FILENAME,
}: DownloadFileUploadParams): Promise<string> => {
  if (!downloadURL.startsWith(`${allowedOrigin}/`)) {
    throw new DownloadFileError(
      `download URL does not match allowed origin: ${allowedOrigin}`,
      undefined,
      400,
    );
  }

  return fetchToFile(downloadURL, tmpDir, filename);
};
