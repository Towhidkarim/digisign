import type { Mailer, MailMessage } from '#/server/mail/mailer.ts';

function print(message: MailMessage): void {
  console.log(
    [
      '----- DigiSign mail -----',
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      '',
      message.text,
      '------------------------',
    ].join('\n'),
  );
}

/** Prints each message in the process console. Used when Resend is not configured. */
export const consoleMailer: Mailer = {
  async send(message: MailMessage) {
    print(message);
    return { providerMessageId: null };
  },
};

/**
 * Prints the message (recipient, names, links) and then sends it. For development
 * only: the text carries magic links, so production never logs it.
 */
export function withDevLog(mailer: Mailer): Mailer {
  return {
    async send(message, options) {
      print(message);
      const receipt = await mailer.send(message, options);
      console.log(
        `[mail] sent to ${message.to}${receipt.providerMessageId ? ` (${receipt.providerMessageId})` : ''}`,
      );
      return receipt;
    },
  };
}
