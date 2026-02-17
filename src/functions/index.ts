import crypto from 'node:crypto';

import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import bodyParser from 'body-parser';
import safeCompare from 'safe-compare';

import { ApiError, createApiError } from './api';

/**
 * Extended Express request type with additional properties added by the
 * middleware.
 *
 * @property rawBody - Raw request body buffer used for HMAC signature
 *   verification
 */
export type RequestWithExtraProps = Request & {
  rawBody?: Buffer;
};

/**
 * Configuration options for creating an Express application.
 *
 * @property _console - Console object for logging (for testing purposes)
 * @property _process - Process object for environment variables (for testing
 *   purposes)
 * @property apiKeyEnvVarName - Environment variable name for the API key
 */
export type FunctionConfig = {
  _console?: typeof console;
  _process?: typeof process;
  apiKeyEnvVarName?: string;
};

/**
 * Easily create a new scanner application with built-in authentication
 * middleware. The middleware validates that the content-type is
 * `application/json`, authenticates the request, and ensures the method is
 * POST. Appropriate HTTP error codes are returned for various failure
 * scenarios:
 * - 400 (bad request)
 * - 401 (unauthorized)
 * - 404 (not found)
 * - 405 (method not allowed)
 * - 415 (unsupported media type)
 * - 500 (internal server error)
 *
 * @remarks
 * **Environment Variables:**
 * - `LAMBDA_API_KEY` - Required. API key for authentication (configurable
 *   via `apiKeyEnvVarName`)
 *
 * **Authentication:**
 * - Bearer token: `Authorization: Bearer <api_key>` (deprecated)
 * - HMAC-SHA256: `Authorization: HMAC-SHA256 <digest>` (digest of request
 *   body)
 */
export const createExpressApp =
  ({
    _console = console,
    _process = process,
    apiKeyEnvVarName = 'LAMBDA_API_KEY',
  }: FunctionConfig = {}) =>
  (handler: RequestHandler) => {
    const app = express();

    const apiKey = _process.env[apiKeyEnvVarName] || null;
    if (apiKey) {
      // Delete the env var to not expose it to add-ons.
      // eslint-disable-next-line no-param-reassign
      delete _process.env[apiKeyEnvVarName];
    }

    // This is the options we pass to the `json()` middleware.
    const jsonOptions = {
      // This is a hack to retain the raw body on the request object. We need
      // this to verify the signature of the request.
      verify(
        req: RequestWithExtraProps,
        res: Response,
        buf: Buffer,
        /* encoding: string, */
      ) {
        req.rawBody = buf;
      },
    };

    // Parse JSON body requests.
    app.use(bodyParser.json(jsonOptions));

    // Authentication middleware plus some extra checks.
    app.use(
      async (req: RequestWithExtraProps, res: Response, next: NextFunction) => {
        // We only allow POST because the `handler` is passed to `app.post()`.
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

        if (!apiKey) {
          next(
            createApiError({
              message: `api key must be set`,
              status: 500,
            }),
          );
          return;
        }

        const authorization =
          req.get('X-Forwarded-Authorization') ?? req.get('Authorization');

        if (!authorization) {
          next(
            createApiError({
              message: `missing authorization header`,
              status: 400,
            }),
          );
          return;
        }

        if (authorization.startsWith('HMAC-SHA256 ') && req.rawBody) {
          const digest = crypto
            .createHmac('sha256', apiKey)
            .update(req.rawBody)
            .digest('hex');

          if (!safeCompare(`HMAC-SHA256 ${digest}`, authorization)) {
            next(
              createApiError({
                message: 'authentication has failed',
                status: 401,
              }),
            );
            return;
          }
        } else if (authorization.startsWith('Bearer ')) {
          if (!safeCompare(`Bearer ${apiKey}`, authorization)) {
            next(
              createApiError({
                message: 'authentication has failed',
                status: 401,
              }),
            );
            return;
          }
        } else {
          next(
            createApiError({
              message: 'unsupported authorization scheme',
              status: 400,
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

        next();
      },
    );

    // We register the handler for the tool that will be exposed.
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

export * from './api';
export * from './download';
