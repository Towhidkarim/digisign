import type { FieldInput } from '#/core/contracts/index.ts';
import { checkSigners, countIssues } from '#/core/signer-rules.ts';

export type NamedSigner = { id: string; name: string; email: string };

export type SignerSummary = {
  fields: number;
  hasSignature: boolean;
  hasInitials: boolean;
  /** True when this signer cannot sign yet: no signature or initials field. */
  needsSignature: boolean;
};

/** What the rail says about one signer, from the editor's own fields. */
export function summarizeSigner(
  signerId: string,
  fields: readonly FieldInput[],
): SignerSummary {
  const own = fields.filter((field) => field.signerId === signerId);
  const hasSignature = own.some((field) => field.kind === 'signature');
  const hasInitials = own.some((field) => field.kind === 'initials');
  return {
    fields: own.length,
    hasSignature,
    hasInitials,
    needsSignature: !hasSignature && !hasInitials,
  };
}

/** One line for the rail card: what is placed, or what is missing. */
export function summaryLine(summary: SignerSummary): string {
  if (summary.needsSignature) return 'Needs a signature or initials field';
  const count = `${summary.fields} ${summary.fields === 1 ? 'field' : 'fields'}`;
  return `${count} · ${summary.hasSignature ? 'signature' : 'initials'} placed`;
}

/** One short sentence per thing that needs fixing, in signing order. */
export function problemList(
  signers: readonly NamedSigner[],
  fields: readonly FieldInput[],
): string[] {
  const lines: string[] = [];
  checkSigners(signers, fields).forEach((check, index) => {
    const name = signers[index]?.name.trim() || `Signer ${index + 1}`;
    if (check.name) lines.push(`Signer ${index + 1} needs a name`);
    if (check.email === 'missing') lines.push(`${name} needs an email address`);
    if (check.email === 'invalid') {
      lines.push(`${name}'s email address is not valid`);
    }
    if (check.email === 'duplicate') {
      lines.push(`${name} shares an email address with another signer`);
    }
    if (check.signature) {
      lines.push(`${name} needs a signature or initials field`);
    }
  });
  return lines;
}

/** The "{n} to fix" count: every rule that fails, from the shared signer rules. */
export function countProblems(
  signers: readonly { id: string; name: string; email: string }[],
  fields: readonly FieldInput[],
): number {
  return countIssues(checkSigners(signers, fields));
}
