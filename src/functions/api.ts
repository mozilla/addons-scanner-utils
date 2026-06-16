import { AMOError } from './error';
import { makeJWT, MakeJWTConfig } from './auth';
import { withRequestIdHeader } from './request-context';

/**
 * Parameters for patching a scanner result.
 *
 * @property url - URL to PATCH
 * @property payload - JSON body to send
 */
export type PatchScannerResultParams = MakeJWTConfig & {
  url: string;
  payload: Record<string, unknown>;
};

/**
 * Parameters for posting a scanner result.
 *
 * @property url - URL to POST
 * @property payload - JSON body to send
 */
export type PostScannerResultParams = MakeJWTConfig & {
  url: string;
  payload: Record<string, unknown>;
};

/**
 * PATCH a scanner result to the AMO API, authenticating with a JWT token
 * computed from the `AMO_JWT_ISS_KEY` and `AMO_JWT_SECRET` environment
 * variables.
 *
 * @throws AMOError if the response is not ok
 */
export const patchScannerResult = async ({
  url,
  payload,
  env,
}: PatchScannerResultParams): Promise<void> => {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: withRequestIdHeader({
      'Content-Type': 'application/json',
      Authorization: `JWT ${makeJWT({ env })}`,
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AMOError(`unexpected response: ${response.statusText}`);
  }
};

/**
 * POST a scanner result to the AMO API, authenticating with a JWT token
 * computed from the `AMO_JWT_ISS_KEY` and `AMO_JWT_SECRET` environment
 * variables.
 *
 * @throws AMOError if the response is not ok
 */
export const postScannerResult = async ({
  url,
  payload,
  env,
}: PostScannerResultParams): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: withRequestIdHeader({
      'Content-Type': 'application/json',
      Authorization: `JWT ${makeJWT({ env })}`,
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AMOError(`unexpected response: ${response.statusText}`);
  }
};
