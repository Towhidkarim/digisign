import {
  type SignatureInput,
  signatureInputSchema,
} from '#/core/contracts/index.ts';

import {
  forgetSavedSignatureFn,
  getSavedSignatureFn,
  saveSignatureFn,
} from '#/server/saved-signature.ts';

const STORAGE_KEY = 'digisign.signature.v1';

export function readSavedSignature(raw: string | null): SignatureInput | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; signature?: unknown };
    if (parsed.v !== 1) return null;
    const signature = signatureInputSchema.safeParse(parsed.signature);
    return signature.success ? signature.data : null;
  } catch {
    return null;
  }
}

export function loadSavedSignature(): SignatureInput | null {
  if (typeof localStorage === 'undefined') return null;
  const saved = readSavedSignature(localStorage.getItem(STORAGE_KEY));
  if (!saved) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return saved;
}

export function rememberSignature(signature: SignatureInput): void {
  if (typeof localStorage === 'undefined') return;
  const checked = signatureInputSchema.parse(signature);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ v: 1, signature: checked }),
  );
}

export function forgetSignature(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * The account's kept signature. `signedIn` says where "remember" should go: to the account when
 * someone is signed in, to this browser when not. Any failure counts as not signed in.
 */
export async function loadAccountSignature(): Promise<{
  signedIn: boolean;
  signature: SignatureInput | null;
}> {
  try {
    return await getSavedSignatureFn();
  } catch {
    return { signedIn: false, signature: null };
  }
}

/** True when it reached the account. False means nobody is signed in or the call failed. */
export async function rememberOnAccount(
  signature: SignatureInput,
): Promise<boolean> {
  try {
    return (await saveSignatureFn({ data: { signature } })).saved;
  } catch {
    return false;
  }
}

export async function forgetOnAccount(): Promise<void> {
  try {
    await forgetSavedSignatureFn();
  } catch {
    // Nothing to undo: the local copy is already gone.
  }
}
