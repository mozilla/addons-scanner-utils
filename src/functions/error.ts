/* eslint-disable max-classes-per-file */

/**
 * Parameters for creating an app error.
 *
 * @property message - Error message
 * @property extraInfo - Additional error details
 * @property status - HTTP status code (default: 500)
 */
export type CreateAppErrorParams = {
  message: string;
  extraInfo?: string;
  status?: number;
};

/**
 * Error with an HTTP status code and optional extra information intended to be
 * used by the error handler defined in `src/functions/index.ts`.
 *
 * @property extraInfo - Additional error details
 * @property status - HTTP status code
 */
export class AppError extends Error {
  extraInfo?: string;

  status: number;

  constructor({ message, extraInfo, status = 500 }: CreateAppErrorParams) {
    super(message);

    this.name = 'AppError';
    this.status = status;
    this.extraInfo = extraInfo;
  }
}

/**
 * Create an app error object with status code and extra information.
 */
export const createAppError = (params: CreateAppErrorParams): AppError => {
  return new AppError(params);
};

/**
 * Error object used when interactions with the AMO API led to errors.
 */
export class AMOError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'AMOError';
  }
}
