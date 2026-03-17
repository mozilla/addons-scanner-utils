/**
 * Error object with HTTP status code and optional extra information intended
 * to be used by the error handler defined in `src/functions/index.ts`.
 *
 * @property message - Error message
 * @property extraInfo - Additional error details
 * @property status - HTTP status code
 */
export type AppError = Error & {
  extraInfo?: string;
  status: number;
};

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
 * Create an app error object with status code and extra information.
 */
export const createAppError = ({
  message,
  extraInfo,
  status = 500,
}: CreateAppErrorParams): AppError => {
  const error = new Error(message) as AppError;
  error.status = status;
  error.extraInfo = extraInfo;

  return error;
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
