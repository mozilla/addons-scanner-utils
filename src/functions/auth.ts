import jwt from 'jsonwebtoken';

const JWT_EXPIRY_SECONDS = 60;

/**
 * Configuration for makeJWT.
 *
 * @property env - Environment variables object (default: process.env)
 * @property expiresIn - Token lifetime in seconds (default: 60)
 */
export type MakeJWTConfig = {
  env?: NodeJS.ProcessEnv;
  expiresIn?: number;
};

/**
 * Create a signed JWT token for AMO API authentication using the
 * `AMO_JWT_ISS_KEY` and `AMO_JWT_SECRET` environment variables.
 *
 * @returns A signed HS256 JWT string
 * @throws Error if the required environment variables are not set
 */
export const makeJWT = ({
  env = process.env,
  expiresIn = JWT_EXPIRY_SECONDS,
}: MakeJWTConfig = {}): string => {
  const issKey = env.AMO_JWT_ISS_KEY;
  const secret = env.AMO_JWT_SECRET;

  if (!issKey) {
    throw new Error('AMO_JWT_ISS_KEY environment variable is not set');
  }

  if (!secret) {
    throw new Error('AMO_JWT_SECRET environment variable is not set');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issKey,
    jti: Math.random().toString(),
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  };

  return jwt.sign(payload, secret, { algorithm: 'HS256' });
};
