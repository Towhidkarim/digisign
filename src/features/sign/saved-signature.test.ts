import { describe, expect, it } from 'vitest';

import { readSavedSignature } from '#/features/sign/saved-signature.ts';

describe('saved signature', () => {
  it('rejects a record that does not pass the signature validator', () => {
    expect(readSavedSignature(null)).toBeNull();
    expect(readSavedSignature('{')).toBeNull();
    expect(
      readSavedSignature(
        JSON.stringify({
          v: 1,
          signature: { kind: 'typed', text: '', font: 'script-1' },
        }),
      ),
    ).toBeNull();
    expect(
      readSavedSignature(
        JSON.stringify({
          v: 2,
          signature: { kind: 'typed', text: 'Ada', font: 'script-1' },
        }),
      ),
    ).toBeNull();
  });

  it('reads a packed typed signature', () => {
    expect(
      readSavedSignature(
        JSON.stringify({
          v: 1,
          signature: { kind: 'typed', text: 'Ada', font: 'script-1' },
        }),
      ),
    ).toEqual({ kind: 'typed', text: 'Ada', font: 'script-1' });
  });
});
