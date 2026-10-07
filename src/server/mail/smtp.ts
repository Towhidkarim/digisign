import { WorkerMailer } from 'worker-mailer';

import {
  MailError,
  type Mailer,
  type MailMessage,
} from '#/server/mail/mailer.ts';

/** What the adapter needs from the SMTP library. Tests pass a stub. */
export type SmtpSend = (
  options: {
    host: string;
    port: number;
    secure: boolean;
    authType: ('plain' | 'login')[];
    credentials: { username: string; password: string };
  },
  email: {
    from: { name: string; email: string };
    to: string;
    subject: string;
    text: string;
    html: string;
  },
) => Promise<void>;

/**
 * 4xx replies (busy, rate limited, try later) and a lost connection are worth
 * retrying. 5xx replies (bad address, rejected message, bad login) will fail again.
 */
export function classifySmtpError(error: unknown): 'transient' | 'permanent' {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/\b([45]\d\d)\b/)?.[1];
  if (code?.startsWith('5')) return 'permanent';
  return 'transient';
}

/** Sends through an SMTP server over TLS, such as Gmail with an app password. */
export function createSmtpMailer(config: {
  user: string;
  password: string;
  fromName?: string;
  host?: string;
  port?: number;
  send?: SmtpSend;
}): Mailer {
  const send: SmtpSend =
    config.send ?? ((options, email) => WorkerMailer.send(options, email));
  return {
    async send(message: MailMessage) {
      try {
        await send(
          {
            host: config.host ?? 'smtp.gmail.com',
            port: config.port ?? 465,
            secure: true,
            // The library sends no login unless the methods are named.
            authType: ['plain', 'login'],
            credentials: { username: config.user, password: config.password },
          },
          {
            from: { name: config.fromName ?? 'DigiSign', email: config.user },
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
          },
        );
      } catch (error) {
        throw new MailError(
          classifySmtpError(error),
          `SMTP send failed. ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            240,
          ),
        );
      }
      // SMTP gives no message id and no idempotency key. The delivery claim in the
      // handler keeps a redelivered event from sending twice.
      return { providerMessageId: null };
    },
  };
}
