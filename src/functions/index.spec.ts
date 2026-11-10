import crypto from 'crypto';

import express from 'express';
import request from 'supertest';

import {
  AMO_REQUEST_ID_HEADER,
  FunctionConfig,
  RequestWithExtraProps,
  createAppError,
  createExpressApp,
  getRequestId,
} from '.';

describe(__filename, () => {
  describe('createAppError', () => {
    it('returns an API error with a message', () => {
      const message = 'oops, error';
      const error = createAppError({ message });

      expect(error.message).toEqual(message);
      expect(error.status).toBeDefined();
      expect(error.extraInfo).not.toBeDefined();
    });

    it('sets the status to 500 by default', () => {
      const error = createAppError({ message: '' });

      expect(error.status).toEqual(500);
    });

    it('sets a status to an error', () => {
      const status = 404;
      const error = createAppError({ message: '', status });

      expect(error.status).toEqual(status);
    });

    it('adds extraInfo to an error', () => {
      const extraInfo = 'some extra info';
      const error = createAppError({ message: '', extraInfo });

      expect(error.extraInfo).toEqual(extraInfo);
    });
  });

  describe('createExpressApp', () => {
    const testAllowedOrigin =
      'https://dont-use-this-subdomain.addons.mozilla.org';

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const createProcessWithEnv = (env = {}) => {
      return { ...process, env } as typeof process;
    };

    const okHandler = (req: RequestWithExtraProps, res: express.Response) => {
      return res.json({ ok: true });
    };

    const _createExpressApp = ({
      _console,
      apiKey = 'valid api key',
      apiKeyEnvVarName = 'API_KEY',
      maxRequestBodySize,
    }: Partial<
      FunctionConfig & { apiKey: string; allowedOrigin: string }
    > = {}) => {
      const _process = createProcessWithEnv({ [apiKeyEnvVarName]: apiKey });

      const decorator = createExpressApp({
        _console,
        _process,
        apiKeyEnvVarName,
        maxRequestBodySize,
      });

      return (handler: express.Handler) => ({
        app: decorator(handler),
        sendApiKey: (app: request.Request) => {
          const body = { some: 'value' };
          const digest = crypto
            .createHmac('sha256', apiKey)
            .update(JSON.stringify(body))
            .digest('hex');
          return app.set('authorization', `HMAC-SHA256 ${digest}`).send(body);
        },
      });
    };

    it('returns a 400 when authorization header is missing', async () => {
      const { app } = _createExpressApp({
        apiKey: 'api-key',
      })(okHandler);

      const response = await request(app).post('/').send({});

      expect(response.status).toEqual(400);
      expect(response.body).toMatchObject({
        error: `missing authorization header`,
      });
    });

    it('protects against misconfigured api key', async () => {
      const { app, sendApiKey } = _createExpressApp({ apiKey: '' })(okHandler);

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(500);
      expect(response.body).toMatchObject({ error: 'api key must be set' });
    });

    it('returns a 500 when api key is missing in the env', async () => {
      const { app } = _createExpressApp({ apiKey: '' })(okHandler);

      const response = await request(app)
        .post('/')
        .set('authorization', 'HMAC-SHA256 ')
        .send({});

      expect(response.status).toEqual(500);
      expect(response.body).toMatchObject({ error: 'api key must be set' });
    });

    it('returns a 401 when an invalid api key creates an unexpected signature', async () => {
      const { app } = _createExpressApp()(okHandler);

      const body = { some: 'value' };
      const digest = crypto
        .createHmac('sha256', 'invalid-api-key')
        .update(JSON.stringify(body))
        .digest('hex');
      const response = await request(app)
        .post('/')
        .set('authorization', `HMAC-SHA256 ${digest}`)
        .send(body);

      expect(response.status).toEqual(401);
      expect(response.body).toMatchObject({
        error: 'authentication has failed',
      });
    });

    it('returns a 405 when method is not POST', async () => {
      const { app, sendApiKey } = _createExpressApp()(okHandler);

      const response = await sendApiKey(request(app).get('/'));

      expect(response.status).toEqual(405);
      expect(response.body).toMatchObject({
        error: 'method not allowed',
      });
    });

    it('returns a 415 when request content type is not json', async () => {
      const { app } = _createExpressApp()(okHandler);

      const response = await request(app).post('/');

      expect(response.status).toEqual(415);
      expect(response.body).toMatchObject({
        error: 'unsupported content type',
      });
    });

    const loggedLine = (fn: jest.Mock): Record<string, unknown> => {
      expect(fn).toHaveBeenCalledTimes(1);
      const [line] = fn.mock.calls[0];
      expect(typeof line).toEqual('string');
      expect(line).not.toContain('\n');
      return JSON.parse(line);
    };

    it('returns a 500 when handler throws an error and logs the error', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const error = 'runtime error';
      const requestId = 'req-500';
      const { app, sendApiKey } = _createExpressApp({ _console })(() => {
        throw new Error(error);
      });

      const response = await sendApiKey(
        request(app).post('/').set(AMO_REQUEST_ID_HEADER, requestId),
      );

      expect(response.status).toEqual(500);
      expect(response.body).toMatchObject({ error });

      expect(loggedLine(_console.error)).toEqual({
        severity: 'ERROR',
        message: error,
        status: 500,
        extra_info: null,
        request_id: requestId,
      });
    });

    it('logs a client error as a warning on one line', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const requestId = 'dcb73090-563c-42d3-9e47-25018be96ce1';
      const { app } = _createExpressApp({ _console })(okHandler);

      const response = await request(app)
        .post('/')
        .set(AMO_REQUEST_ID_HEADER, requestId)
        .send('not json');

      expect(response.status).toEqual(415);

      expect(loggedLine(_console.error)).toEqual({
        severity: 'WARNING',
        message: 'unsupported content type',
        status: 415,
        extra_info: null,
        request_id: requestId,
      });
    });

    it('logs the extra info of an error', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const { app, sendApiKey } = _createExpressApp({ _console })((
        req,
        res,
        next,
      ) => {
        next(
          createAppError({
            message: 'bad request',
            extraInfo: 'the details',
            status: 400,
          }),
        );
      });

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(400);
      expect(response.body).toEqual({
        error: 'bad request',
        extra_info: 'the details',
      });
      expect(loggedLine(_console.error)).toMatchObject({
        severity: 'WARNING',
        message: 'bad request',
        status: 400,
        extra_info: 'the details',
      });
    });

    it('logs the trace of the request when the project ID is set', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const traceId = '105445aa7843bc8bf206b12000100000';
      const apiKeyEnvVarName = 'API_KEY';
      const _process = createProcessWithEnv({
        [apiKeyEnvVarName]: 'api-key',
        GOOGLE_CLOUD_PROJECT: 'some-project',
      });
      const app = createExpressApp({ _console, _process, apiKeyEnvVarName })(
        okHandler,
      );

      const response = await request(app)
        .post('/')
        .set('X-Cloud-Trace-Context', `${traceId}/1;o=1`)
        .send('not json');

      expect(response.status).toEqual(415);
      expect(loggedLine(_console.error)).toMatchObject({
        'logging.googleapis.com/trace': `projects/some-project/traces/${traceId}`,
      });
    });

    it('logs a request ID for a body that fails to parse', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const requestId = 'req-bad-body';
      const { app } = _createExpressApp({ _console })(okHandler);

      const response = await request(app)
        .post('/')
        .set('Content-Type', 'application/json')
        .set(AMO_REQUEST_ID_HEADER, requestId)
        .send('{not json');

      expect(response.status).toEqual(400);
      expect(loggedLine(_console.error)).toMatchObject({
        severity: 'WARNING',
        status: 400,
        request_id: requestId,
      });
    });

    it('deletes the api key env variable when creating the lambda function', async () => {
      const apiKeyEnvVarName = 'API_KEY';
      const apiKey = 'valid api key';
      const _process = createProcessWithEnv({
        [apiKeyEnvVarName]: apiKey,
      });

      expect(_process.env).toHaveProperty(apiKeyEnvVarName, apiKey);

      createExpressApp({ _process, apiKeyEnvVarName })(okHandler);

      expect(_process.env).not.toHaveProperty(apiKeyEnvVarName);
    });

    it('rejects unsupport auth schemes', async () => {
      const { app } = _createExpressApp({
        apiKey: 'api-key',
      })(okHandler);

      const body = { download_url: `${testAllowedOrigin}/some.xpi` };
      const response = await request(app)
        .post('/')
        .set('content-type', 'application/json')
        .set(
          'authorization',
          `HMAC ccb46b24272fc0260997debe19928fc771ffae8bcc153c8ee9cf08d278ad72f3`,
        )
        .send(body);

      expect(response.status).toEqual(400);
      expect(response.body).toMatchObject({
        error: `unsupported authorization scheme`,
      });
    });

    it('accepts the HMAC-SHA256 auth scheme', async () => {
      const { app } = _createExpressApp({
        apiKey: 'api-key',
      })(okHandler);

      const body = { download_url: `${testAllowedOrigin}/some.xpi` };
      const response = await request(app)
        .post('/')
        .set('content-type', 'application/json')
        .set(
          'authorization',
          // Generated with python by using the following snippet:
          //
          // hmac.new(
          //   'api-key'.encode(),
          //   '{\n    "download_url": "https://dont-use-this-subdomain.addons.mozilla.org/some.xpi"\n}'.encode(),
          //   digestmod=hashlib.sha256
          // ).hexdigest()
          //
          `HMAC-SHA256 ccb46b24272fc0260997debe19928fc771ffae8bcc153c8ee9cf08d278ad72f3`,
        )
        // We use this so that we force a formatted JSON with whitespaces and
        // newlines. This makes sure we're using the raw body when computing
        // the request's signature.
        .send(JSON.stringify(body, null, 4));

      expect(response.status).toEqual(200);
    });

    it('supports the X-Forwarded-Authorization header', async () => {
      const { app } = _createExpressApp({
        apiKey: 'api-key',
      })(okHandler);

      const body = { download_url: `${testAllowedOrigin}/some.xpi` };
      const response = await request(app)
        .post('/')
        .set('content-type', 'application/json')
        .set('authorization', 'some-other-auth-value')
        .set(
          'X-Forwarded-Authorization',
          // Generated with python by using the following snippet:
          //
          // hmac.new(
          //   'api-key'.encode(),
          //   '{\n    "download_url": "https://dont-use-this-subdomain.addons.mozilla.org/some.xpi"\n}'.encode(),
          //   digestmod=hashlib.sha256
          // ).hexdigest()
          //
          `HMAC-SHA256 ccb46b24272fc0260997debe19928fc771ffae8bcc153c8ee9cf08d278ad72f3`,
        )
        // We use this so that we force a formatted JSON with whitespaces and
        // newlines. This makes sure we're using the raw body when computing
        // the request's signature.
        .send(JSON.stringify(body, null, 4));

      expect(response.status).toEqual(200);
    });

    it('exposes the X-AMO-Request-ID to the handler via the request context', async () => {
      const requestId = 'req-xyz-789';
      const requestIdHandler = (
        req: RequestWithExtraProps,
        res: express.Response,
      ) => {
        return res.json({
          fromContext: getRequestId(),
          fromRequest: req.amoRequestId,
        });
      };

      const { app, sendApiKey } = _createExpressApp()(requestIdHandler);

      const response = await sendApiKey(
        request(app).post('/').set(AMO_REQUEST_ID_HEADER, requestId),
      );

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        fromContext: requestId,
        fromRequest: requestId,
      });
    });

    it('generates a request ID when the X-AMO-Request-ID header is absent', async () => {
      const generatedId = '11111111-2222-3333-4444-555555555555';
      jest.spyOn(crypto, 'randomUUID').mockReturnValue(generatedId);

      const requestIdHandler = (
        req: RequestWithExtraProps,
        res: express.Response,
      ) => {
        return res.json({
          fromContext: getRequestId(),
          fromRequest: req.amoRequestId,
        });
      };

      const { app, sendApiKey } = _createExpressApp()(requestIdHandler);

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(200);
      // The generated ID is exposed both on the request and in the context.
      expect(response.body.fromContext).toEqual(generatedId);
      expect(response.body.fromRequest).toEqual(generatedId);
    });

    it('returns a 413 when the request body exceeds the configured limit', async () => {
      const { app, sendApiKey } = _createExpressApp({ maxRequestBodySize: 1 })(
        okHandler,
      );

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(413);
    });
  });
});
