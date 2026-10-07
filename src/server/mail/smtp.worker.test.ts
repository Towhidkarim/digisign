import { describe, expect, it } from 'vitest';

import { classifySmtpError, createSmtpMailer } from '#/server/mail/smtp.ts';

const message = {
  to: 'a@example.com',
  subject: 's',
  text: 't',
  html: '<p>t</p>',
};

describe('SMTP mailer', () => {
  it('classifies 5xx replies as permanent and everything else as transient', () => {
    expect(classifySmtpError(new Error('550 5.1.1 No such user'))).toBe(
      'permanent',
    );
    expect(
      classifySmtpError(new Error('535 Username and Password not accepted')),
    ).toBe('permanent');
    expect(classifySmtpError(new Error('421 4.7.0 Try again later'))).toBe(
      'transient',
    );
    expect(classifySmtpError(new Error('Socket closed'))).toBe('transient');
  });

  it('sends from the account with a display name over TLS', async () => {
    const seen: unknown[] = [];
    const mailer = createSmtpMailer({
      user: 'sender@gmail.com',
      password: 'app-password',
      send: async (options, email) => {
        seen.push({ options, email });
      },
    });
    const receipt = await mailer.send(message);
    expect(receipt.providerMessageId).toBeNull();
    expect(seen[0]).toMatchObject({
      options: { host: 'smtp.gmail.com', port: 465, secure: true },
      email: {
        from: { name: 'DigiSign', email: 'sender@gmail.com' },
        to: 'a@example.com',
        subject: 's',
      },
    });
  });

  it('turns server replies into retryable or final mail errors', async () => {
    const failing = (reply: string) =>
      createSmtpMailer({
        user: 'sender@gmail.com',
        password: 'x',
        send: async () => {
          throw new Error(reply);
        },
      });
    await expect(
      failing('550 mailbox unavailable').send(message),
    ).rejects.toMatchObject({ kind: 'permanent' });
    await expect(failing('451 try later').send(message)).rejects.toMatchObject({
      kind: 'transient',
    });
  });
});
