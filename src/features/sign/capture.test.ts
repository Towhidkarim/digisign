import { describe, expect, it } from 'vitest';

import { CAPTURE_BOX, pointsToStrokes } from '#/features/sign/capture.ts';

describe('signature capture', () => {
  it('packs canvas points into the 3:1 capture box', () => {
    const strokes = pointsToStrokes(
      [{ points: [{ x: 100, y: 50 }] }],
      200,
      100,
    );
    expect(strokes).toEqual([[[CAPTURE_BOX.w / 2, CAPTURE_BOX.h / 2]]]);
  });
});
