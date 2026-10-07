/** Why an invite link can or cannot be used. One vocabulary for the peek, the exchange and the UI. */
export const INVITE_REASONS = [
  'ready',
  'signed',
  'replaced',
  'expired',
  'cancelled',
  'stopped',
  'invalid',
] as const;

export type InviteReason = (typeof INVITE_REASONS)[number];

export const INVITE_REASON_MESSAGE: Record<InviteReason, string> = {
  ready: 'This link is ready to use.',
  signed: 'You have already signed this document.',
  replaced: 'This link was replaced by a newer one. Use the latest email.',
  expired: 'This link has expired.',
  cancelled: 'The sender cancelled this document.',
  stopped: 'Signing on this document was stopped.',
  invalid: 'This link is no longer valid.',
};
