import { describe, expect, it } from 'vitest';

import {
  cssDeltaToMicro,
  footerStripMicro,
  MICRO,
  microToPercent,
  type PageGeometry,
  pointerToMicro,
  viewSize,
} from '#/core/coords.ts';

const letter: PageGeometry = {
  mediaBox: [0, 0, 612, 792],
  cropBox: [0, 0, 612, 792],
  rotate: 0,
};

describe('coords', () => {
  it('keeps pointer micro-units as integers', () => {
    expect(pointerToMicro(0, 0, 200)).toBe(0);
    expect(pointerToMicro(200, 0, 200)).toBe(MICRO);
    expect(Number.isInteger(pointerToMicro(33, 0, 200))).toBe(true);
  });

  it('swaps view size for 90 and 270 degree pages', () => {
    const wide: PageGeometry = {
      mediaBox: [0, 0, 200, 400],
      cropBox: [0, 0, 200, 400],
      rotate: 90,
    };
    expect(viewSize(wide)).toEqual({ viewW: 400, viewH: 200 });
    expect(viewSize({ ...wide, rotate: 270 })).toEqual({
      viewW: 400,
      viewH: 200,
    });
    expect(viewSize({ ...wide, rotate: 0 })).toEqual({
      viewW: 200,
      viewH: 400,
    });
  });

  it('reserves a 36 pt footer in micro-units', () => {
    expect(footerStripMicro(letter)).toBe(Math.round((36 / 792) * MICRO));
  });

  it('converts micro-units to percent', () => {
    expect(microToPercent(250_000)).toBe(25);
    expect(microToPercent(250_000)).toBe(250_000 / 10_000);
  });

  it('moves at least one micro-unit for a 1 px nudge', () => {
    expect(cssDeltaToMicro(1, 10_000_000)).toBe(1);
    expect(cssDeltaToMicro(-1, 10_000_000)).toBe(-1);
  });
});
