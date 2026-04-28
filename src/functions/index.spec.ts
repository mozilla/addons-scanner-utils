import crypto from 'crypto';

import express from 'express';
import request from 'supertest';

import {
  FunctionConfig,
  RequestWithExtraProps,
  createAppError,
  createExpressApp,
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

    it('returns a 500 when handler throws an error and logs the error', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const error = 'runtime error';
      const { app, sendApiKey } = _createExpressApp({ _console })(() => {
        throw new Error(error);
      });

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(500);
      expect(response.body).toMatchObject({ error });

      expect(_console.error).toHaveBeenCalled();
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

    it('returns a 413 when the request body exceeds the configured limit', async () => {
      const { app, sendApiKey } = _createExpressApp({ maxRequestBodySize: 1 })(
        okHandler,
      );

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(413);
    });
  });
});
