import type { FieldInput } from '#/core/contracts/index.ts';

/**
 * The signer rules shared by the editor and the server's publish check. They are pure, so the
 * browser can run them as the user edits. The server still runs its own check on every publish.
 */

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How the signers are reached. 'link' sends no mail: the sender copies each signing link. */
export type Delivery = 'email' | 'link';

export const PREFILL_MESSAGE =
  'Fill in every prefilled text field before sending.';

/** Prefilled text the sender has not written yet. Each one blocks sending. */
export function emptyPrefills(
  fields: readonly Pick<FieldInput, 'kind' | 'prefill'>[],
): number {
  return fields.filter(
    (field) =>
      field.kind === 'prefilled_text' && (field.prefill ?? '').trim() === '',
  ).length;
}

export const SIGNER_MESSAGES = {
  name: 'Every signer needs a name.',
  email: 'Every signer needs an email address.',
  duplicateEmail: 'Each signer needs a different email address.',
  signature: 'Every signer needs a signature or initials field.',
} as const;

export type EmailIssue = 'missing' | 'invalid' | 'duplicate';

export type SignerCheck = {
  /** The name is blank. */
  name: boolean;
  email: EmailIssue | null;
  /** No signature or initials field is assigned to this signer. */
  signature: boolean;
};

type SignerInput = {
  id: string;
  name: string;
  email: string;
  /** The owner signing their own document: no address is needed. */
  self?: boolean;
};

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The kinds that let a signer actually sign. Text, date, name and checkbox fields do not. */
export function isSigningKind(kind: FieldInput['kind']): boolean {
  return kind === 'signature' || kind === 'initials';
}

/**
 * The kinds the signer never fills in: the date and the name write themselves, and prefilled text
 * is whatever the sender put there. The server stamps all three when the signer signs.
 */
export function isAutoKind(kind: FieldInput['kind']): boolean {
  return (
    kind === 'date_signed' || kind === 'full_name' || kind === 'prefilled_text'
  );
}

/** One result per signer, in the same order. */
export function checkSigners(
  signers: readonly SignerInput[],
  fields: readonly Pick<FieldInput, 'signerId' | 'kind'>[],
): SignerCheck[] {
  const signing = new Set(
    fields.filter((field) => isSigningKind(field.kind)).map((f) => f.signerId),
  );
  const counts = new Map<string, number>();
  for (const signer of signers) {
    const email = normalizedEmail(signer.email);
    if (email && emailPattern.test(email)) {
      counts.set(email, (counts.get(email) ?? 0) + 1);
    }
  }
  return signers.map((signer) => {
    const email = normalizedEmail(signer.email);
    let issue: EmailIssue | null = null;
    // An address is optional: a signer without one gets a link the sender shares. One that is typed still has to look like one.
    if (!email) issue = null;
    else if (!emailPattern.test(email)) issue = 'invalid';
    else if ((counts.get(email) ?? 0) > 1) issue = 'duplicate';
    return {
      name: signer.name.trim().length === 0,
      email: issue,
      signature: !signing.has(signer.id),
    };
  });
}

/** How many separate things need fixing: each failed rule on each signer counts once. */
export function countIssues(checks: readonly SignerCheck[]): number {
  return checks.reduce(
    (total, check) =>
      total +
      (check.name ? 1 : 0) +
      (check.email ? 1 : 0) +
      (check.signature ? 1 : 0),
    0,
  );
}

export function isReady(check: SignerCheck): boolean {
  return !check.name && check.email === null && !check.signature;
}
