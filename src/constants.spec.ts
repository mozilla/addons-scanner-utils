import { ECMA_VERSION } from './constants.js';

describe('constants', () => {
  it('exports an ECMA_VERSION constant', () => {
    expect(ECMA_VERSION).toEqual(13);
  });
});
