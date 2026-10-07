import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Page: () => null,
}));
vi.mock('#/pdf/setup.ts', () => ({}));
vi.mock('#/pdf/render.ts', () => ({ render: async () => new Uint8Array() }));
vi.mock('#/pdf/fonts.ts', async (original) => ({
  ...(await original<typeof import('#/pdf/fonts.ts')>()),
  installScriptFaces: async () => {},
  loadScriptFonts: async () => ({}),
}));
vi.mock('signature_pad', () => ({
  default: class {
    clear() {}
    isEmpty() {
      return true;
    }
    toData() {
      return [];
    }
    fromData() {}
    off() {}
    addEventListener() {}
  },
}));
vi.mock('#/features/sign/signing-client.ts', () => ({
  CONNECTION_MESSAGE:
    "We couldn't reach DigiSign. Check your connection and try again.",
  loadView: vi.fn(),
  fetchSource: vi.fn(),
  submitSignature: vi.fn(),
  declineSignature: vi.fn(),
  reopenSession: vi.fn(),
  senderFor: vi.fn(),
}));

import type { FieldInput } from '#/core/contracts/index.ts';
import { INVITE_TOKEN_KEY, saveEntries } from '#/features/sign/desk-model.ts';
import {
  InviteReasonScreen,
  SessionTimedOutScreen,
} from '#/features/sign/signer-status.tsx';
import * as client from '#/features/sign/signing-client.ts';
import { SigningDesk } from '#/features/sign/signing-desk.tsx';

const mocked = vi.mocked(client);

function field(
  id: string,
  kind: FieldInput['kind'],
  y: number,
  required = true,
): FieldInput {
  return {
    id,
    signerId: 'S1',
    pageIndex: 0,
    kind,
    x: 100_000,
    y,
    w: 300_000,
    h: 60_000,
    required,
  };
}

const fields = [
  field('F-SIGN', 'signature', 100_000),
  field('F-TEXT', 'text', 250_000),
  field('F-TICK', 'checkbox', 400_000),
  field('F-DATE', 'date_signed', 550_000),
  field('F-NAME', 'full_name', 650_000),
];
const page = {
  mediaBox: [0, 0, 612, 792] as [number, number, number, number],
  cropBox: [0, 0, 612, 792] as [number, number, number, number],
  rotate: 0 as const,
};
const base = {
  documentId: 'DOC1',
  title: 'Service agreement.pdf',
  sender: { name: 'Amara Hassan', email: 'amara@studio.example' },
  you: { id: 'S1', name: 'Amina Rahman', email: 'amina@example.com', order: 1 },
  count: 2,
  others: [{ order: 2, name: 'Daniel Brooks', status: 'pending' as const }],
  serverNow: Date.UTC(2026, 9, 7, 9),
  dateSigned: { text: '7th Oct, 2026', reliable: true },
};
const ready = {
  ...base,
  kind: 'ready' as const,
  fileName: 'Service agreement.pdf',
  fields,
  records: [],
  stateHash: 'h'.repeat(64),
  upload: {
    documentId: 'DOC1',
    sha256: 'a'.repeat(64),
    sizeBytes: 1,
    pageCount: 1,
    geometry: [page],
  },
  layout: { documentId: 'DOC1', layoutVersion: 1, fields },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocked.fetchSource.mockResolvedValue({ bytes: new Uint8Array([1]) });
});

/** Fills every required field and opens the review dialog. */
async function fillAndReview(user: ReturnType<typeof userEvent.setup>) {
  await screen.findAllByText('3 fields left');
  await user.type(screen.getByLabelText(/Text box/), 'TW-1042');
  await user.click(screen.getByRole('button', { name: /Checkmark, required/ }));
  await user.click(screen.getByRole('button', { name: 'Next field' }));
  await user.click(await screen.findByRole('tab', { name: 'Type' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Type your name' }),
    'Amina Rahman',
  );
  await user.click(screen.getByRole('button', { name: 'Use this signature' }));
  await screen.findAllByText('All fields done');
  await user.click(screen.getByRole('button', { name: 'Review and sign' }));
  await screen.findByRole('dialog', { name: 'Ready to sign?' });
}

async function consentAndSign(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog', { name: 'Ready to sign?' });
  const sign = within(dialog).getByRole('button', { name: 'Sign document' });
  expect(sign.getAttribute('aria-disabled')).toBe('true');
  await user.click(
    within(dialog).getByRole('checkbox', {
      name: /I agree to sign this document electronically/,
    }),
  );
  await user.click(sign);
}

describe('signing', () => {
  it('a middle signer ends on the confirmation, with no error and no refetch', async () => {
    mocked.loadView.mockResolvedValue({ view: ready });
    mocked.submitSignature.mockResolvedValue({
      ok: { status: 'signed', signedAt: Date.UTC(2026, 9, 7, 9, 14) },
    });
    const user = userEvent.setup();
    render(<SigningDesk />);
    await fillAndReview(user);
    await consentAndSign(user);
    const heading = await screen.findByRole('heading', {
      name: 'Your signature is recorded',
    });
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText(
        'Thank you. You have signed Service agreement.pdf. Nothing more is needed from you.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Daniel Brooks has been asked to sign/),
    ).toBeTruthy();
    expect(screen.queryByText(/not waiting for your signature/)).toBeNull();
    // The "ready" context is not fetched again after a successful signature.
    expect(mocked.loadView).toHaveBeenCalledTimes(1);
    // The sent request carries what the signer entered and the consent they gave.
    const body = mocked.submitSignature.mock.calls[0]?.[0];
    expect(body?.consent).toBe(true);
    expect(body?.values.map((value) => value.fieldId).sort()).toEqual([
      'F-SIGN',
      'F-TEXT',
      'F-TICK',
    ]);
  });

  it('a dropped connection offers Try again, which reuses the same key', async () => {
    mocked.loadView.mockResolvedValue({ view: ready });
    mocked.submitSignature
      .mockResolvedValueOnce({ network: true })
      .mockResolvedValueOnce({
        ok: { status: 'signed', signedAt: Date.UTC(2026, 9, 7, 9, 14) },
      });
    const user = userEvent.setup();
    render(<SigningDesk />);
    await fillAndReview(user);
    await consentAndSign(user);
    await screen.findByRole('heading', {
      name: "We couldn't record your signature",
    });
    expect(
      screen.getByText(
        "Your connection dropped before we could save it. Nothing was lost, and you won't sign twice if you try again.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Your signature is recorded' });
    const [first, second] = mocked.submitSignature.mock.calls;
    expect(first?.[0].idempotencyKey).toBeTruthy();
    expect(second?.[0].idempotencyKey).toBe(first?.[0].idempotencyKey);
  });

  it('declining needs a reason, and ends on the declined screen', async () => {
    mocked.loadView
      .mockResolvedValueOnce({ view: ready })
      .mockResolvedValueOnce({
        view: {
          ...base,
          kind: 'declined-by-you' as const,
          reason: 'Wrong terms',
          declinedAt: Date.UTC(2026, 9, 7, 9, 20),
        },
      });
    mocked.declineSignature.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SigningDesk />);
    await screen.findAllByText('3 fields left');
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Decline to sign' }),
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Decline to sign?',
    });
    const decline = within(dialog).getByRole('button', {
      name: 'Decline this document',
    });
    expect((decline as HTMLButtonElement).disabled).toBe(true);
    const reason = within(dialog).getByLabelText('Why are you declining?');
    await user.type(reason, '   ');
    expect((decline as HTMLButtonElement).disabled).toBe(true);
    await user.type(reason, 'Wrong terms');
    expect(within(dialog).getByText('14 of 500')).toBeTruthy();
    expect((decline as HTMLButtonElement).disabled).toBe(false);
    await user.click(decline);
    await screen.findByRole('heading', { name: 'You declined to sign' });
    expect(mocked.declineSignature).toHaveBeenCalledWith('Wrong terms');
    expect(screen.getByText('Wrong terms')).toBeTruthy();
  });
});

describe('the desk', () => {
  it('announces progress, and the asterisk cannot block a tap', async () => {
    mocked.loadView.mockResolvedValue({ view: ready });
    render(<SigningDesk />);
    await screen.findAllByText('3 fields left');
    const live = document.querySelector('output[aria-live=polite]');
    expect(live?.textContent).toBe('3 fields left');
    const asterisks = document.querySelectorAll(
      '[data-field-id] svg.lucide-asterisk',
    );
    expect(asterisks.length).toBeGreaterThan(0);
    for (const asterisk of asterisks) {
      expect(asterisk.getAttribute('class')).toContain('pointer-events-none');
    }
  });

  it('its dialogs are modal', async () => {
    mocked.loadView.mockResolvedValue({ view: ready });
    const user = userEvent.setup();
    render(<SigningDesk />);
    await screen.findAllByText('3 fields left');
    await user.click(screen.getByRole('button', { name: 'Next field' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Add your signature',
    });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

describe('status screens', () => {
  it.each([
    [
      'replaced',
      'This link has been replaced',
      'Amara Hassan sent you a newer link for Lease. Use the most recent email from DigiSign.',
    ],
    [
      'expired',
      'This link has expired',
      'Signing links stop working after a while. Ask Amara Hassan to send you a new one.',
    ],
    [
      'cancelled',
      'This document was cancelled',
      'Amara Hassan cancelled Lease. Nothing more is needed from you.',
    ],
    [
      'stopped',
      'Signing has stopped',
      'Someone declined to sign Lease, so it is no longer waiting for signatures. Nothing more is needed from you.',
    ],
  ] as const)('%s', (reason, title, text) => {
    render(
      <InviteReasonScreen
        reason={reason}
        sender={{
          name: 'Amara Hassan',
          email: 'amara@studio.example',
          title: 'Lease',
        }}
      />,
    );
    const card = screen.getByRole('alert');
    expect(within(card).getByRole('heading', { name: title })).toBeTruthy();
    expect(within(card).getByText(text)).toBeTruthy();
    expect(
      screen.getByText(
        reason === 'expired'
          ? 'Nothing was signed.'
          : 'Questions about this document? Contact Amara Hassan at amara@studio.example.',
      ),
    ).toBeTruthy();
  });

  it('expired has an Email button with a prefilled subject', () => {
    render(
      <InviteReasonScreen
        reason="expired"
        sender={{
          name: 'Amara Hassan',
          email: 'amara@studio.example',
          title: 'Lease',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Email Amara Hassan' });
    expect(link.getAttribute('href')).toBe(
      'mailto:amara@studio.example?subject=New%20signing%20link%20for%20Lease',
    );
  });

  it('an unknown link shows no sender details', () => {
    render(<InviteReasonScreen reason="invalid" sender={null} />);
    expect(
      screen.getByRole('heading', { name: "This link doesn't look right" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Check that you copied the whole link from the email, or ask the sender for a new one.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Contact/)).toBeNull();
    expect(screen.queryByText('This link is no longer valid.')).toBeNull();
  });

  it('session timed out explains itself and offers to continue', async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <SessionTimedOutScreen
        onContinue={onContinue}
        busy={false}
        error=""
        sender={null}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Your session timed out' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'For your security, we sign you out after 30 minutes of inactivity. Nothing was signed.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Your entries on this page are kept on this device, so you can pick up where you left off.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue signing' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('Continue signing re-opens the session and restores the entries', async () => {
    sessionStorage.setItem(INVITE_TOKEN_KEY, 't'.repeat(43));
    saveEntries('DOC1', 'S1', [{ fieldId: 'F-TEXT', text: 'TW-1042' }]);
    mocked.loadView
      .mockResolvedValueOnce({
        problem: {
          kind: 'session',
          message: 'Open your invite link again to keep signing.',
        },
      })
      .mockResolvedValueOnce({ view: ready });
    mocked.reopenSession.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SigningDesk />);
    await screen.findByRole('heading', { name: 'Your session timed out' });
    await user.click(screen.getByRole('button', { name: 'Continue signing' }));
    await waitFor(() =>
      expect(mocked.reopenSession).toHaveBeenCalledWith('t'.repeat(43)),
    );
    const text = (await screen.findByLabelText(/Text box/)) as HTMLInputElement;
    expect(text.value).toBe('TW-1042');
    expect(
      (await screen.findAllByText('2 fields left')).length,
    ).toBeGreaterThan(0);
  });

  it('without a stored link, Continue signing shows the expired screen', async () => {
    mocked.loadView.mockResolvedValue({
      problem: {
        kind: 'session',
        message: 'Open the invite link to sign this document.',
      },
    });
    const user = userEvent.setup();
    render(<SigningDesk />);
    await user.click(
      await screen.findByRole('button', { name: 'Continue signing' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeTruthy();
  });

  it('a signer who already signed sees the already-signed screen, not an error', async () => {
    mocked.loadView.mockResolvedValue({
      view: {
        ...base,
        kind: 'signed-waiting' as const,
        signedAt: Date.UTC(2026, 9, 7, 9, 14),
        nextSignerName: 'Daniel Brooks',
      },
    });
    render(<SigningDesk />);
    expect(
      await screen.findByRole('heading', { name: "You've already signed" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing more is needed from you. Daniel Brooks hasn't signed yet.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
