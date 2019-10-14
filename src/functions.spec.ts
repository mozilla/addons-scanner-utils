import path from 'path';

import express from 'express';
import request from 'supertest';

import {
  FunctionConfig,
  RequestWithFiles,
  createApiError,
  createExpressApp,
} from './functions';

describe(__filename, () => {
  describe('createApiError', () => {
    it('returns an API error with a message', () => {
      const message = 'oops, error';
      const error = createApiError({ message });

      expect(error.message).toEqual(message);
      expect(error.status).toBeDefined();
      expect(error.extraInfo).not.toBeDefined();
    });

    it('sets the status to 500 by default', () => {
      const error = createApiError({ message: '' });

      expect(error.status).toEqual(500);
    });

    it('sets a status to an error', () => {
      const status = 404;
      const error = createApiError({ message: '', status });

      expect(error.status).toEqual(status);
    });

    it('adds extraInfo to an error', () => {
      const extraInfo = 'some extra info';
      const error = createApiError({ message: '', extraInfo });

      expect(error.extraInfo).toEqual(extraInfo);
    });
  });

  describe('createExpressApp', () => {
    const testAllowedOrigin =
      'https://dont-use-this-subdomain.addons.mozilla.org';

    const createProcessWithEnv = (env = {}) => {
      return { ...process, env } as typeof process;
    };

    const okHandler = (req: RequestWithFiles, res: express.Response) => {
      return res.json({ ok: true, xpiFilepath: req.xpiFilepath });
    };

    const _createExpressApp = ({
      _console,
      _download = jest.fn() as FunctionConfig['_download'],
      _unlinkFile = jest.fn().mockReturnValue(Promise.resolve()),
      allowedOrigin = testAllowedOrigin,
      apiKey = 'valid api key',
      apiKeyEnvVarName = 'API_KEY',
      requiredApiKeyParam,
      requiredDownloadUrlParam,
      tmpDir,
      xpiFilename,
    }: Partial<
      FunctionConfig & { apiKey: string; allowedOrigin: string }
    > = {}) => {
      const _process = createProcessWithEnv({
        [apiKeyEnvVarName]: apiKey,
        ALLOWED_ORIGIN: allowedOrigin,
      });

      const decorator = createExpressApp({
        _console,
        _download,
        _process,
        _unlinkFile,
        apiKeyEnvVarName,
        requiredApiKeyParam,
        requiredDownloadUrlParam,
        tmpDir,
        xpiFilename,
      });

      return (handler: express.Handler) => ({
        app: decorator(handler),
        sendApiKey: (app: request.Request) => {
          return app.send({ api_key: apiKey });
        },
      });
    };

    it('returns a 400 when requiredApiKeyParam is missing', async () => {
      const requiredApiKeyParam = 'key';
      const { app } = _createExpressApp({
        apiKey: 'api-key',
        requiredApiKeyParam,
      })(okHandler);

      const response = await request(app)
        .post('/')
        .send({});

      expect(response.status).toEqual(400);
      expect(response.body).toMatchObject({
        error: `missing "${requiredApiKeyParam}" parameter`,
      });
    });

    it('protects against misconfigured api key', async () => {
      const { app, sendApiKey } = _createExpressApp({ apiKey: '' })(okHandler);

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(401);
      expect(response.body).toMatchObject({
        error: 'authentication has failed',
      });
    });

    it('returns a 401 when api key is missing in the env', async () => {
      const { app } = _createExpressApp({ apiKey: '' })(okHandler);

      const response = await request(app)
        .post('/')
        .send({ api_key: 'valid api key' });

      expect(response.status).toEqual(401);
      expect(response.body).toMatchObject({
        error: 'authentication has failed',
      });
    });

    it('returns a 401 when api key is invalid', async () => {
      const { app } = _createExpressApp()(okHandler);

      const response = await request(app)
        .post('/')
        .send({ api_key: 'invalid api key' });

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

    it('returns a 400 when requiredDownloadUrlParam is missing', async () => {
      const requiredDownloadUrlParam = 'file';
      const { app, sendApiKey } = _createExpressApp({
        requiredDownloadUrlParam,
      })(okHandler);

      const response = await sendApiKey(request(app).post('/'));

      expect(response.status).toEqual(400);
      expect(response.body).toMatchObject({
        error: `missing "${requiredDownloadUrlParam}" parameter`,
      });
    });

    it('returns null when ALLOWED_ORIGIN is misconfigured', async () => {
      expect(() => {
        _createExpressApp({ allowedOrigin: '' })(okHandler);
      }).toThrow(/ALLOWED_ORIGIN is not set/);
    });

    it('rejects invalid origins', async () => {
      const downloadURL = `https://not-a-valid-origin.example.org/an-addon.xpi`;
      const { app, sendApiKey } = _createExpressApp()(okHandler);

      const response = await sendApiKey(request(app).post('/')).send({
        download_url: downloadURL,
      });

      expect(response.status).toEqual(400);
      expect(response.body).toMatchObject({
        error: 'invalid origin',
      });
    });

    it('downloads the file pointed by the download_url parameter', async () => {
      const _download = jest.fn();
      const downloadURL = `${testAllowedOrigin}/an-addon.xpi`;
      const tmpDir = '/some/tmp/dir';
      const xpiFilename = 'filename-for-uploaded.xpi';
      const { app, sendApiKey } = _createExpressApp({
        _download,
        allowedOrigin: testAllowedOrigin,
        tmpDir,
        xpiFilename,
      })(okHandler);

      const response = await sendApiKey(request(app).post('/')).send({
        download_url: downloadURL,
      });

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        ok: true,
        xpiFilepath: path.join(tmpDir, xpiFilename),
      });

      expect(_download).toHaveBeenCalledWith(downloadURL, tmpDir, {
        filename: xpiFilename,
      });
    });

    it('returns a 500 when downloading the file has failed', async () => {
      const error = 'download has failed';
      const _download = jest.fn().mockImplementation(() => {
        throw new Error(error);
      });
      const { app, sendApiKey } = _createExpressApp({ _download })(okHandler);

      const response = await sendApiKey(request(app).post('/')).send({
        download_url: `${testAllowedOrigin}/some.xpi`,
      });

      expect(response.status).toEqual(500);
      expect(response.body).toMatchObject({
        error: 'failed to download file',
        extra_info: expect.stringMatching(error),
      });
    });

    it('returns a 404 when endpoint called is invalid', async () => {
      const { app, sendApiKey } = _createExpressApp()(okHandler);

      const response = await sendApiKey(request(app).post('/invalid')).send({
        download_url: `${testAllowedOrigin}/some.xpi`,
      });

      expect(response.status).toEqual(404);
      expect(response.body).toMatchObject({
        error: 'not found',
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

      const response = await sendApiKey(request(app).post('/')).send({
        download_url: `${testAllowedOrigin}/some.xpi`,
      });

      expect(response.status).toEqual(500);
      expect(response.body).toMatchObject({ error });

      expect(_console.error).toHaveBeenCalled();
    });

    it('deletes the api key env variable when creating the lambda function', async () => {
      const apiKeyEnvVarName = 'API_KEY';
      const apiKey = 'valid api key';
      const _process = createProcessWithEnv({
        [apiKeyEnvVarName]: apiKey,
        ALLOWED_ORIGIN: testAllowedOrigin,
      });

      expect(_process.env).toHaveProperty(apiKeyEnvVarName, apiKey);

      createExpressApp({ _process, apiKeyEnvVarName })(okHandler);

      expect(_process.env).not.toHaveProperty(apiKeyEnvVarName);
    });

    it('deletes the downloaded xpi once the response is sent', async () => {
      const _unlinkFile = jest.fn().mockReturnValue(Promise.resolve());
      const tmpDir = '/some/tmp/dir';
      const xpiFilename = 'filename-for-uploaded.xpi';
      const { app, sendApiKey } = _createExpressApp({
        _unlinkFile,
        tmpDir,
        xpiFilename,
      })(okHandler);

      await sendApiKey(request(app).post('/')).send({
        download_url: `${testAllowedOrigin}/some.xpi`,
      });

      expect(_unlinkFile).toHaveBeenCalledWith(path.join(tmpDir, xpiFilename));
    });

    it('logs an error when deleting the downloaded xpi has failed', async () => {
      const _console = {
        ...console,
        error: jest.fn(),
      };
      const error = new Error('some fs error');
      const _unlinkFile = jest.fn().mockRejectedValue(error);
      const { app, sendApiKey } = _createExpressApp({
        _console,
        _unlinkFile,
      })(okHandler);

      await sendApiKey(request(app).post('/')).send({
        download_url: `${testAllowedOrigin}/some.xpi`,
      });

      expect(_console.error).toHaveBeenCalledWith(`_unlinkFile(): ${error}`);
    });
  });
});
