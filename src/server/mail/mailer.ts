export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailSendOptions = {
  /** Stable per event. The provider uses it to drop a repeated send. */
  idempotencyKey: string;
};

export type MailReceipt = {
  providerMessageId: string | null;
};

/** A send that failed. `transient` is worth retrying, `permanent` is not. */
export class MailError extends Error {
  readonly kind: 'transient' | 'permanent';

  constructor(kind: 'transient' | 'permanent', message: string) {
    super(message);
    this.name = 'MailError';
    this.kind = kind;
  }
}

export interface Mailer {
  send(message: MailMessage, options?: MailSendOptions): Promise<MailReceipt>;
}
