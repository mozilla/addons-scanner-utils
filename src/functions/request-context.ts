import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Name of the header carrying the unique request ID issued by AMO.
 */
export const AMO_REQUEST_ID_HEADER = 'X-AMO-Request-ID';

/**
 * Data kept around for the duration of a single request.
 *
 * @property requestId - The value of the incoming `X-AMO-Request-ID` header, or
 *   a generated UUID when the header is absent.
 */
export type RequestContext = {
  requestId?: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Return the `X-AMO-Request-ID` of the request currently being handled, or
 * `undefined` when there is no active request context (e.g. outside of the
 * Express middleware chain).
 */
export const getRequestId = (): string | undefined =>
  requestContextStorage.getStore()?.requestId;

/**
 * Return a copy of `headers` with the `X-AMO-Request-ID` header added when a
 * request ID is available in the current context. When no request ID is in
 * scope, `headers` is returned unchanged.
 */
export const withRequestIdHeader = (
  headers: Record<string, string> = {},
): Record<string, string> => {
  const requestId = getRequestId();

  return requestId
    ? { ...headers, [AMO_REQUEST_ID_HEADER]: requestId }
    : headers;
};

/**
 * Express middleware that captures the AMO request ID from the incoming
 * `X-AMO-Request-ID` header (generating a UUID when it is absent), exposes it
 * on `req.amoRequestId`, and runs the rest of the middleware chain inside a
 * request context so the ID stays available for the duration of the request
 * and can be echoed back on every outgoing AMO API call.
 */
export const requestIdMiddleware: RequestHandler = (
  req: Request & { amoRequestId?: string },
  res: Response,
  next: NextFunction,
) => {
  const requestId = req.get(AMO_REQUEST_ID_HEADER) ?? crypto.randomUUID();
  req.amoRequestId = requestId;

  requestContextStorage.run({ requestId }, () => next());
};
