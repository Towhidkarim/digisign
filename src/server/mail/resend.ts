import { type ErrorResponse, Resend } from 'resend';

import {
  MailError,
  type Mailer,
  type MailMessage,
  type MailSendOptions,
} from '#/server/mail/mailer.ts';

/** What the adapter needs from the Resend client. Tests pass a stub. */
export type ResendClient = {
  emails: {
    send(
      payload: {
        from: string;
        to: string[];
        subject: string;
        html: string;
        text: string;
      },
      options?: { idempotencyKey?: string },
    ): Promise<
      | { data: { id: string } | null; error: null }
      | { data: null; error: Pick<ErrorResponse, 'message' | 'statusCode'> }
    >;
  };
};

/** 429, 5xx, a lost connection and a concurrent duplicate are worth retrying. Other 4xx will fail again. */
export function classifyResendStatus(
  status: number | null,
): 'transient' | 'permanent' {
  if (status === null) return 'transient';
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return 'transient';
  }
  if (status >= 500) return 'transient';
  return 'permanent';
}

export function createResendMailer(config: {
  apiKey: string;
  from: string;
  client?: ResendClient;
}): Mailer {
  const client: ResendClient = config.client ?? new Resend(config.apiKey);
  return {
    async send(message: MailMessage, options?: MailSendOptions) {
      let result: Awaited<ReturnType<ResendClient['emails']['send']>>;
      try {
        result = await client.emails.send(
          {
            from: config.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          },
          options?.idempotencyKey
            ? { idempotencyKey: options.idempotencyKey }
            : undefined,
        );
      } catch (error) {
        throw new MailError(
          'transient',
          error instanceof Error
            ? error.message
            : 'The mail provider could not be reached.',
        );
      }
      if (result.error) {
        throw new MailError(
          classifyResendStatus(result.error.statusCode),
          `Resend answered ${result.error.statusCode ?? 'no status'}. ${result.error.message}`
            .trim()
            .slice(0, 240),
        );
      }
      return { providerMessageId: result.data?.id ?? null };
    },
  };
}
