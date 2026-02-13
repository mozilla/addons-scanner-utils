import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

import { createApiError } from './api';

export const DEFAULT_DOWNLOAD_FILENAME = 'input.xpi';

export class DownloadFileError extends Error {
  status: number;

  extraInfo?: string;

  constructor(message: string, extraInfo?: string, status: number = 500) {
    super(message);

    this.name = 'DownloadFileError';
    this.status = status;
    this.extraInfo = extraInfo;
  }

  toApiError() {
    return createApiError({
      message: this.message,
      extraInfo: this.extraInfo,
      status: this.status,
    });
  }
}

export type DownloadFileUploadParams = {
  downloadURL: string;
  allowedOrigin: string;
  tmpDir?: string;
  filename?: string;
};

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

  try {
    const response = await fetch(downloadURL);
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
