import { describe, expect, it } from 'vitest';

import { canonicalJson } from '#/core/canonical-json.ts';

describe('canonical JSON', () => {
  it('sorts keys and writes integers without decimals', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ n: 2 })).toBe('{"n":2}');
    expect(canonicalJson({ z: undefined, a: true })).toBe('{"a":true}');
  });

  it('rejects values that are not finite JSON', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson(undefined)).toThrow();
  });
});
