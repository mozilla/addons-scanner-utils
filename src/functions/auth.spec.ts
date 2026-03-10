import jwt from 'jsonwebtoken';

import { makeJWT } from './auth';

describe(__filename, () => {
  describe('makeJWT', () => {
    const issKey = 'test-iss-key';
    const secret = 'test-secret';

    const makeProcess = (env: Record<string, string> = {}) =>
      ({ env }) as unknown as typeof process;

    it('throws when AMO_JWT_ISS_KEY is not set', () => {
      expect(() =>
        makeJWT({ _process: makeProcess({ AMO_JWT_SECRET: secret }) }),
      ).toThrow('AMO_JWT_ISS_KEY environment variable is not set');
    });

    it('throws when AMO_JWT_SECRET is not set', () => {
      expect(() =>
        makeJWT({ _process: makeProcess({ AMO_JWT_ISS_KEY: issKey }) }),
      ).toThrow('AMO_JWT_SECRET environment variable is not set');
    });

    it('returns a valid signed JWT', () => {
      const token = makeJWT({
        _process: makeProcess({
          AMO_JWT_ISS_KEY: issKey,
          AMO_JWT_SECRET: secret,
        }),
      });

      const decoded = jwt.verify(token, secret) as jwt.JwtPayload;

      expect(decoded.iss).toEqual(issKey);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.jti).toBeDefined();
    });
  });
});
