import crypto from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

import {
  AMO_REQUEST_ID_HEADER,
  getRequestId,
  requestIdMiddleware,
  requestContextStorage,
  withRequestIdHeader,
} from './request-context';

describe(__filename, () => {
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
  });
});
