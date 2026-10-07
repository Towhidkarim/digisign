import { env } from 'cloudflare:workers';

import { consoleMailer, withDevLog } from '#/server/mail/console.ts';
import type { Mailer } from '#/server/mail/mailer.ts';
import { createResendMailer } from '#/server/mail/resend.ts';
import { createSmtpMailer } from '#/server/mail/smtp.ts';

let override: Mailer | null = null;

/** Tests swap the adapter here. */
export function setMailer(mailer: Mailer | null): void {
  override = mailer;
}

/**
 * SMTP (Gmail with an app password) when SMTP_USER and SMTP_PASS are set, else Resend
 * when RESEND_API_KEY and MAIL_FROM are set, else the console, which prints the magic
 * link in the terminal. In development a real sender also prints each mail first.
 */
export function getMailer(): Mailer {
  if (override) return override;
  const real = realMailer();
  if (!real) return consoleMailer;
  // Development shows the links and names in the terminal as well. Production does not.
  return import.meta.env.DEV ? withDevLog(real) : real;
}

function realMailer(): Mailer | null {
  if (env.SMTP_USER && env.SMTP_PASS) {
    return createSmtpMailer({ user: env.SMTP_USER, password: env.SMTP_PASS });
  }
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    return createResendMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.MAIL_FROM,
    });
  }
  return null;
}

/** The public origin used in links when no request is available (queue and cron). */
export function appOrigin(): string {
  return (env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
}
