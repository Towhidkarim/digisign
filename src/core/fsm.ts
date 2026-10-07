export const documentStatuses = [
  'draft',
  'in_progress',
  'completed',
  'declined',
  'voided',
  'expired',
] as const;

export type DocumentStatus = (typeof documentStatuses)[number];

export const documentTransitions: Record<
  DocumentStatus,
  readonly DocumentStatus[]
> = {
  draft: ['in_progress'],
  in_progress: ['completed', 'declined', 'voided', 'expired'],
  completed: [],
  declined: [],
  voided: [],
  expired: [],
};

export const signerStatuses = [
  'pending',
  'invited',
  'signed',
  'declined',
  'voided',
] as const;

export type SignerStatus = (typeof signerStatuses)[number];

export const signerTransitions: Record<SignerStatus, readonly SignerStatus[]> =
  {
    pending: ['invited', 'voided'],
    invited: ['signed', 'declined', 'voided'],
    signed: [],
    declined: [],
    voided: [],
  };

export function canTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}
