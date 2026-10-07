/** Signer identity colors are theme tokens (--signer-1 to --signer-6); the 7th to 10th signer reuse them. */
export const SIGNER_COLORS = [
  'var(--signer-1)',
  'var(--signer-2)',
  'var(--signer-3)',
  'var(--signer-4)',
  'var(--signer-5)',
  'var(--signer-6)',
] as const;

export function signerColor(index: number): string {
  return SIGNER_COLORS[index % SIGNER_COLORS.length] ?? SIGNER_COLORS[0];
}
