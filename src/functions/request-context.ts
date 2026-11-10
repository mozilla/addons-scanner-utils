import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Name of the header carrying the unique request ID issued by AMO.
 */
export const AMO_REQUEST_ID_HEADER = 'X-AMO-Request-ID';

/**
 * Name of the header carrying the Cloud Trace id that Cloud Run assigns to
 * each request, formatted `TRACE_ID/SPAN_ID;o=TRACE_TRUE`.
 */
export const CLOUD_TRACE_CONTEXT_HEADER = 'X-Cloud-Trace-Context';

/**
 * Data kept around for the duration of a single request.
 *
 * @property requestId - The value of the incoming `X-AMO-Request-ID` header, or
 *   a generated UUID when the header is absent.
 * @property traceId - The Cloud Trace id of the request, when the incoming
 *   request carried one. Logged on every line (see `log.ts`) so that Cloud
 *   Logging shows the scanner's lines under Cloud Run's own request entry.
 */
export type RequestContext = {
  requestId?: string;
  traceId?: string;
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
 * Return the Cloud Trace id of the request currently being handled, or
 * `undefined` when there is no active request context or the request carried
 * no trace header.
 */
export const getTraceId = (): string | undefined =>
  requestContextStorage.getStore()?.traceId;

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Extract the trace id from the request's `X-Cloud-Trace-Context` header
 * (`TRACE_ID/SPAN_ID;o=1`), falling back to the W3C `traceparent` header
 * (`00-TRACE_ID-SPAN_ID-FLAGS`) that Cloud Run also sets. Only a 32-digit hex
 * id is accepted, because these headers can be set by any client and the id
 * ends up in the logs.
 */
export const getTraceIdFromHeaders = (req: {
  get: (name: string) => string | string[] | undefined;
}): string | undefined => {
  const header = (name: string): string | undefined => {
    const value = req.get(name);
    return typeof value === 'string' ? value : undefined;
  };

  const fromCloudTrace = header(CLOUD_TRACE_CONTEXT_HEADER)?.split('/')[0];
  if (fromCloudTrace && TRACE_ID_PATTERN.test(fromCloudTrace)) {
    return fromCloudTrace;
  }

  const fromTraceparent = header('traceparent')?.split('-')[1];
  if (fromTraceparent && TRACE_ID_PATTERN.test(fromTraceparent)) {
    return fromTraceparent;
  }

  return undefined;
};

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
 * and can be echoed back on every outgoing AMO API call. The Cloud Trace id
 * is captured into the same context, for the logger.
 */
export const requestIdMiddleware: RequestHandler = (
  req: Request & { amoRequestId?: string },
  res: Response,
  next: NextFunction,
) => {
  const requestId = req.get(AMO_REQUEST_ID_HEADER) ?? crypto.randomUUID();
  req.amoRequestId = requestId;

  requestContextStorage.run(
    { requestId, traceId: getTraceIdFromHeaders(req) },
    () => next(),
  );
};
