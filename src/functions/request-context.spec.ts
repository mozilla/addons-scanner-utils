import crypto from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

import {
  AMO_REQUEST_ID_HEADER,
  CLOUD_TRACE_CONTEXT_HEADER,
  getRequestId,
  getTraceId,
  getTraceIdFromHeaders,
  requestIdMiddleware,
  requestContextStorage,
  withRequestIdHeader,
} from './request-context';

describe(__filename, () => {
  const traceId = '105445aa7843bc8bf206b12000100000';

  describe('getTraceId', () => {
    it('returns undefined when there is no active context', () => {
      expect(getTraceId()).toBeUndefined();
    });

    it('returns the trace ID from the active context', () => {
      requestContextStorage.run({ traceId }, () => {
        expect(getTraceId()).toEqual(traceId);
      });
    });
  });

  describe('getTraceIdFromHeaders', () => {
    const createReq = (headers: Record<string, string> = {}) => ({
      get: (name: string) => headers[name],
    });

    it('reads the trace ID from X-Cloud-Trace-Context', () => {
      const req = createReq({
        [CLOUD_TRACE_CONTEXT_HEADER]: `${traceId}/1;o=1`,
      });

      expect(getTraceIdFromHeaders(req)).toEqual(traceId);
    });

    it('reads the trace ID from X-Cloud-Trace-Context without a span', () => {
      const req = createReq({ [CLOUD_TRACE_CONTEXT_HEADER]: traceId });

      expect(getTraceIdFromHeaders(req)).toEqual(traceId);
    });

    it('falls back to the traceparent header', () => {
      const req = createReq({
        traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
      });

      expect(getTraceIdFromHeaders(req)).toEqual(traceId);
    });

    it('prefers X-Cloud-Trace-Context over traceparent', () => {
      const other = 'ffffffffffffffffffffffffffffffff';
      const req = createReq({
        [CLOUD_TRACE_CONTEXT_HEADER]: `${traceId}/1;o=1`,
        traceparent: `00-${other}-00f067aa0ba902b7-01`,
      });

      expect(getTraceIdFromHeaders(req)).toEqual(traceId);
    });

    it.each([
      ['not hex', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/1;o=1'],
      ['too short', 'abc/1;o=1'],
      ['empty', ''],
      ['log injection', '{"severity":"ERROR"}\n/1'],
    ])('rejects a trace ID that is %s', (name, value) => {
      const req = createReq({ [CLOUD_TRACE_CONTEXT_HEADER]: value });

      expect(getTraceIdFromHeaders(req)).toBeUndefined();
    });

    it('returns undefined when there is no trace header', () => {
      expect(getTraceIdFromHeaders(createReq())).toBeUndefined();
    });
  });

  describe('getRequestId', () => {
    it('returns undefined when there is no active context', () => {
      expect(getRequestId()).toBeUndefined();
    });

    it('returns the request ID from the active context', () => {
      const requestId = 'abc-123';

      requestContextStorage.run({ requestId }, () => {
        expect(getRequestId()).toEqual(requestId);
      });
    });

    it('returns undefined when the context has no request ID', () => {
      requestContextStorage.run({}, () => {
        expect(getRequestId()).toBeUndefined();
      });
    });
  });

  describe('withRequestIdHeader', () => {
    it('adds the X-AMO-Request-ID header when a request ID is in scope', () => {
      const requestId = 'abc-123';

      requestContextStorage.run({ requestId }, () => {
        expect(withRequestIdHeader({ Authorization: 'JWT token' })).toEqual({
          Authorization: 'JWT token',
          [AMO_REQUEST_ID_HEADER]: requestId,
        });
      });
    });

    it('returns the headers unchanged when there is no request ID', () => {
      const headers = { Authorization: 'JWT token' };

      requestContextStorage.run({}, () => {
        expect(withRequestIdHeader(headers)).toEqual(headers);
      });
    });

    it('returns the headers unchanged when there is no active context', () => {
      const headers = { Authorization: 'JWT token' };

      expect(withRequestIdHeader(headers)).toEqual(headers);
    });

    it('defaults to an empty set of headers', () => {
      expect(withRequestIdHeader()).toEqual({});
    });
  });

  describe('requestIdMiddleware', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    const createReq = (headers: Record<string, string> = {}) =>
      ({
        get: (name: string) => headers[name],
      }) as unknown as Request & { amoRequestId?: string };

    it('exposes the incoming X-AMO-Request-ID on the request and context', () => {
      const requestId = 'req-xyz-789';
      const req = createReq({ [AMO_REQUEST_ID_HEADER]: requestId });
      const next: NextFunction = jest.fn(() => {
        expect(getRequestId()).toEqual(requestId);
      });

      requestIdMiddleware(req, {} as Response, next);

      expect(req.amoRequestId).toEqual(requestId);
      expect(next).toHaveBeenCalled();
    });

    it('generates a request ID when the header is absent', () => {
      const generatedId = '11111111-2222-3333-4444-555555555555';
      jest.spyOn(crypto, 'randomUUID').mockReturnValue(generatedId);
      const req = createReq();
      const next: NextFunction = jest.fn(() => {
        expect(getRequestId()).toEqual(generatedId);
      });

      requestIdMiddleware(req, {} as Response, next);

      expect(req.amoRequestId).toEqual(generatedId);
      expect(next).toHaveBeenCalled();
    });

    it('exposes the trace ID of the request on the context', () => {
      const req = createReq({
        [CLOUD_TRACE_CONTEXT_HEADER]: `${traceId}/1;o=1`,
      });
      const next: NextFunction = jest.fn(() => {
        expect(getTraceId()).toEqual(traceId);
      });

      requestIdMiddleware(req, {} as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('leaves the trace ID undefined when there is no trace header', () => {
      const req = createReq();
      const next: NextFunction = jest.fn(() => {
        expect(getTraceId()).toBeUndefined();
      });

      requestIdMiddleware(req, {} as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
