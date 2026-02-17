/**
 * Error object with HTTP status code and optional extra information.
 *
 * @property message - Error message
 * @property extraInfo - Additional error details
 * @property status - HTTP status code
 */
export type ApiError = Error & {
  extraInfo?: string;
  status: number;
};

/**
 * Parameters for creating an API error.
 *
 * @property message - Error message
 * @property extraInfo - Additional error details
 * @property status - HTTP status code (default: 500)
 */
export type CreateApiErrorParams = {
  message: string;
  extraInfo?: string;
  status?: number;
};

/**
 * Create API error object with status code and extra information.
 */
export const createApiError = ({
  message,
  extraInfo,
  status = 500,
}: CreateApiErrorParams): ApiError => {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.extraInfo = extraInfo;

  return error;
};
