import { describe, expect, it } from 'vitest';

import { fitWithin } from '#/features/sign/image-signature.ts';

describe('fitWithin', () => {
  const max = { w: 600, h: 240 };
  it('never enlarges a small picture', () => {
    expect(fitWithin(100, 40, max)).toEqual({ w: 100, h: 40 });
  });
  it('shrinks a wide picture to the width, keeping proportions', () => {
    expect(fitWithin(1200, 200, max)).toEqual({ w: 600, h: 100 });
  });
  it('shrinks a tall picture to the height', () => {
    expect(fitWithin(500, 960, max)).toEqual({ w: 125, h: 240 });
  });
});
