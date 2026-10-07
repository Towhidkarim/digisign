import {
  type SignatureInput,
  signatureInputSchema,
} from '#/core/contracts/index.ts';

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
