export type ApiError = Error & {
  extraInfo?: string;
  status: number;
};

export type CreateApiErrorParams = {
  message: string;
  extraInfo?: string;
  status?: number;
};

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
