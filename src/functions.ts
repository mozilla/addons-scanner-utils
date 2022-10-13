import fs from 'fs';
import os from 'os';
import path from 'path';
import stream from 'stream';
import util from 'util';

import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import safeCompare from 'safe-compare';

type ApiError = Error & {
  extraInfo?: string;
  status?: number;
};

type CreateApiErrorParams = {
  message: string;
  extraInfo?: string;
  status?: number;
};

export const createApiError = ({
  message,
  extraInfo,
  status = 500,
}: CreateApiErrorParams): ApiError => {
  const error: ApiError = new Error(message);
  error.status = status;
  error.extraInfo = extraInfo;

  return error;
};

// The `createExpressApp` adds new attributes to the Express request.
export type RequestWithFiles = Request & {
  xpiFilepath?: string;
};

export type FunctionConfig = {
  _console?: typeof console;
  _fetch?: typeof fetch;
  _process?: typeof process;
  _unlinkFile?: typeof fs.promises.unlink;
  apiKeyEnvVarName?: string;
  requiredApiKeyParam?: string;
  requiredDownloadUrlParam?: string;
  tmpDir?: string;
  xpiFilename?: string;
};

export const createExpressApp =
  ({
    _console = console,
    _fetch = fetch,
    _process = process,
    _unlinkFile = fs.promises.unlink,
    apiKeyEnvVarName = 'LAMBDA_API_KEY',
    requiredApiKeyParam = 'api_key',
    requiredDownloadUrlParam = 'download_url',
    tmpDir = os.tmpdir(),
    xpiFilename = 'input.xpi',
  }: FunctionConfig = {}) =>
  (handler: RequestHandler) => {
    const app = express();

    const allowedOrigin = _process.env.ALLOWED_ORIGIN || null;
    if (!allowedOrigin) {
      throw new Error('ALLOWED_ORIGIN is not set or unexpectedly empty!');
    }

    const apiKey = _process.env[apiKeyEnvVarName] || null;
    if (apiKey) {
      // Delete the env var to not expose it to add-ons.
      // eslint-disable-next-line no-param-reassign
      delete _process.env[apiKeyEnvVarName];
    }

    // Parse JSON body requests.
    app.use(bodyParser.json());

    // This middleware handles the common logic needed to expose our tools. It
    // adds a new `xpiFilepath` attribute to the Express request or returns an
    // error that will be converted to an API error by the error handler
    // middleware declared at the bottom of the middleware chain.
    app.use(
      async (req: RequestWithFiles, res: Response, next: NextFunction) => {
        const allowedMethods = ['POST'];

        if (req.headers['content-type'] !== 'application/json') {
          // We do not throw because we are inside a callback, so we pass an error
          // to the next middleware, which will be the error handler.
          // See: https://expressjs.com/en/guide/error-handling.html
          next(
            createApiError({
              message: 'unsupported content type',
              status: 415,
            }),
          );
          return;
        }

        if (typeof req.body[requiredApiKeyParam] === 'undefined') {
          next(
            createApiError({
              message: `missing "${requiredApiKeyParam}" parameter`,
              status: 400,
            }),
          );
          return;
        }

        if (!apiKey || !safeCompare(apiKey, req.body[requiredApiKeyParam])) {
          next(
            createApiError({
              message: 'authentication has failed',
              status: 401,
            }),
          );
          return;
        }

        if (
          !allowedMethods
            .map((method) => method.toLowerCase())
            .includes(req.method.toLowerCase())
        ) {
          next(createApiError({ message: 'method not allowed', status: 405 }));
          return;
        }

        const downloadURL = req.body[requiredDownloadUrlParam];

        if (!downloadURL) {
          next(
            createApiError({
              message: `missing "${requiredDownloadUrlParam}" parameter`,
              status: 400,
            }),
          );
          return;
        }

        if (!downloadURL.startsWith(allowedOrigin)) {
          next(createApiError({ message: 'invalid origin', status: 400 }));
          return;
        }

        try {
          const xpiFilepath = path.join(tmpDir, xpiFilename);
          const streamPipeline = util.promisify(stream.pipeline);
          const response = await _fetch(downloadURL);
          if (!response.ok) {
            throw new Error(`unexpected response ${response.statusText}`);
          }
          await streamPipeline(response.body, fs.createWriteStream(xpiFilepath));

          req.xpiFilepath = xpiFilepath;

          // Add a listener that will run code after the response is sent.
          res.on('finish', () => {
            _unlinkFile(xpiFilepath).catch((error) => {
              _console.error(`_unlinkFile(): ${error}`);
            });
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          next(
            createApiError({
              message: 'failed to download file',
              extraInfo: err.message,
            }),
          );
          return;
        }

        next();
      },
    );

    // We register the handler for the tool that will be exposed. This handler is
    // guaranteed to have a valid `xpiFilepath` stored on disk.
    app.post('/', handler);

    // NotFound handler.
    app.use((req: Request, res: Response, next: NextFunction) => {
      next(createApiError({ message: 'not found', status: 404 }));
    });

    // Error handler. Even though we are not using `next`, it must be kept
    // because the Express error handler signature requires 4 arguments.
    app.use(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (err: ApiError, req: Request, res: Response, next: NextFunction) => {
        const error = {
          error: err.message,
          extra_info: err.extraInfo || null,
        };

        res.status(err.status || 500).json(error);

        // Also send the error to the cloud provider.
        _console.error(error);
      },
    );

    return app;
  };
