import { createElement } from 'react';
import { render } from 'react-email';

import type { MailMessage } from '#/server/mail/mailer.ts';
import {
  DigiSignEmail,
  type EmailCardProps,
} from '#/server/mail/templates/digisign-email.tsx';

export const EMAIL_TEMPLATES = [
  'invite',
  'reminder',
  'completed',
  'declined',
  'voided',
  'expired',
] as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export type EmailData = {
  template: EmailTemplate;
  to: string;
  name: string;
  title: string;
  /** Magic link for invite and reminder. */
  url?: string;
  /** Public page for the finished document. */
  verifyUrl?: string;
  /** Who declined, for the declined notice. */
  actor?: string;
  /** Why they declined. Only the document owner's notice carries it. */
  reason?: string;
};

/** Everything one mail says. The HTML and the plain text are both built from it. */
type Content = EmailCardProps & { subject: string };

/** Only the invite and reminder carry a magic link. No template asks for an account. */
export async function renderEmail(data: EmailData): Promise<MailMessage> {
  const content = describe(data);
  const { subject, ...card } = content;
  const html = await render(createElement(DigiSignEmail, card));
  return { to: data.to, subject, text: plainText(content), html };
}

function describe(data: EmailData): Content {
  const name = data.name.trim() || 'there';
  const title = data.title;
  switch (data.template) {
    case 'invite':
      return {
        subject: `Please sign ${title}`,
        preview: `${name}, you have been asked to sign ${title}.`,
        badge: {
          glyph: '✎',
          label: 'Waiting for your signature',
          tone: 'brand',
        },
        heading: 'Please sign this document',
        lead: `${name}, you have been asked to sign "${title}".`,
        documentTitle: title,
        action: data.url
          ? { label: 'Review and sign', url: data.url }
          : undefined,
        footnote:
          'You do not need an account. Opening the link does not sign anything.',
      };
    case 'reminder':
      return {
        subject: `Reminder: please sign ${title}`,
        preview: `${title} is still waiting for your signature.`,
        badge: { glyph: '◷', label: 'Reminder', tone: 'warning' },
        heading: 'Still waiting for your signature',
        lead: `${name}, "${title}" is still waiting for your signature.`,
        documentTitle: title,
        action: data.url
          ? { label: 'Review and sign', url: data.url }
          : undefined,
        footnote: 'This link replaces the one in your earlier email.',
      };
    case 'completed':
      return {
        subject: `${title} is fully signed`,
        preview: `Everyone has signed ${title}.`,
        badge: { glyph: '✓', label: 'Completed', tone: 'success' },
        heading: 'Everyone has signed',
        lead: `Everyone has signed "${title}".`,
        documentTitle: title,
        action: data.verifyUrl
          ? { label: 'Check the signed record', url: data.verifyUrl }
          : undefined,
        footnote:
          'Anyone with the signed PDF can check on the verify page that it has not been changed.',
      };
    case 'declined': {
      const reason = data.reason?.trim();
      return {
        subject: `${title} was declined`,
        preview: `${data.actor?.trim() || 'A signer'} declined to sign ${title}.`,
        badge: { glyph: '✕', label: 'Declined', tone: 'danger' },
        heading: 'Signing has stopped',
        lead: `${data.actor?.trim() || 'A signer'} declined to sign "${title}". Nobody else will be asked to sign it.`,
        documentTitle: title,
        quote: reason ? { label: 'Reason', text: reason } : undefined,
      };
    }
    case 'voided':
      return {
        subject: `${title} was cancelled`,
        preview: `The sender cancelled ${title}.`,
        badge: { glyph: '⊘', label: 'Voided', tone: 'neutral' },
        heading: 'This document was cancelled',
        lead: `The sender cancelled "${title}". The signing link no longer works.`,
        documentTitle: title,
      };
    case 'expired':
      return {
        subject: `${title} expired`,
        preview: `${title} was not finished in time.`,
        badge: { glyph: '◷', label: 'Expired', tone: 'warning' },
        heading: 'This document expired',
        lead: `"${title}" was not finished in time. The signing link no longer works.`,
        documentTitle: title,
      };
  }
}

/** The plain-text part, for clients that do not show HTML and for the dev console. */
function plainText(content: Content): string {
  const lines = [content.lead];
  if (content.quote) {
    lines.push('', `${content.quote.label}: ${content.quote.text}`);
  }
  if (content.action) {
    lines.push('', `${content.action.label}: ${content.action.url}`);
  }
  if (content.footnote) lines.push('', content.footnote);
  return lines.join('\n');
}
