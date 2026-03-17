import { patchScannerResult } from './api';

describe(__filename, () => {
  describe('patchScannerResult', () => {
    const issKey = 'test-iss-key';
    const secret = 'test-secret';
    const env = { AMO_JWT_ISS_KEY: issKey, AMO_JWT_SECRET: secret };
    const url = 'https://addons.mozilla.org/api/v5/scanner/results/1/';
    const payload = { results: { version: '1.2.3', matchedRules: [] } };

    it('sends a PATCH request with correct headers and body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await patchScannerResult({ url, payload, env });

      const [calledURL, calledOptions] = (global.fetch as jest.Mock).mock
        .calls[0];
      expect(calledURL).toEqual(url);
      expect(calledOptions.method).toEqual('PATCH');
      expect(calledOptions.headers['Content-Type']).toEqual('application/json');
      expect(calledOptions.headers.Authorization).toMatch(/^JWT /);
      expect(calledOptions.body).toEqual(JSON.stringify(payload));
    });

    it('throws AMOError when response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
      });

      await expect(patchScannerResult({ url, payload, env })).rejects.toThrow(
        'unexpected response: Unprocessable Entity',
      );
    });

    it('throws when AMO_JWT_ISS_KEY is not set', async () => {
      await expect(
        patchScannerResult({ url, payload, env: { AMO_JWT_SECRET: secret } }),
      ).rejects.toThrow('AMO_JWT_ISS_KEY environment variable is not set');
    });

    it('throws when AMO_JWT_SECRET is not set', async () => {
      await expect(
        patchScannerResult({ url, payload, env: { AMO_JWT_ISS_KEY: issKey } }),
      ).rejects.toThrow('AMO_JWT_SECRET environment variable is not set');
    });
  });
});
