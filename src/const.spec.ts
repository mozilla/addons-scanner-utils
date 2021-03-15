import { ECMA_VERSION } from './const';

describe(__filename, () => {
  it('exports an ECMA_VERSION constant', () => {
    expect(ECMA_VERSION).toEqual(12);
  });
});
