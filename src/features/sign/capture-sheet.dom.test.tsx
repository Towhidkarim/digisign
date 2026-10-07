import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('signature_pad', () => ({
  default: class {
    constructor(public canvas: HTMLCanvasElement) {}
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
vi.mock('#/pdf/fonts.ts', async (original) => ({
  ...(await original<typeof import('#/pdf/fonts.ts')>()),
  installScriptFaces: async () => {},
}));

import type { SignatureInput } from '#/core/contracts/index.ts';
import { CaptureSheet } from '#/features/sign/capture-sheet.tsx';

function Harness({ onUse }: { onUse?: (signature: SignatureInput) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open ? (
        <CaptureSheet
          onCancel={() => setOpen(false)}
          onUse={(signature) => {
            onUse?.(signature);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

async function openSheet() {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open sheet' });
  await user.click(opener);
  return { user, opener };
}

describe('capture sheet', () => {
  it('is a labelled, modal dialog and moves focus inside', async () => {
    await openSheet();
    const dialog = await screen.findByRole('dialog', {
      name: 'Add your signature',
    });
    expect(dialog.getAttribute('aria-modal') ?? 'true').toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside the dialog', async () => {
    const { user } = await openSheet();
    const dialog = await screen.findByRole('dialog');
    for (let press = 0; press < 14; press += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let press = 0; press < 14; press += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes on Escape and returns focus to what opened it', async () => {
    const { user, opener } = await openSheet();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('has real tabs, and no Saved tab when nothing is saved', async () => {
    await openSheet();
    await screen.findByRole('dialog');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Draw', 'Type']);
  });

  it('shows Saved when a signature is remembered', async () => {
    localStorage.setItem(
      'digisign.signature.v1',
      JSON.stringify({
        v: 1,
        signature: { kind: 'typed', text: 'Ava Lin', font: 'script-2' },
      }),
    );
    await openSheet();
    await screen.findByRole('dialog');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Draw',
      'Type',
      'Saved',
    ]);
  });

  it('moves between the six fonts with the arrow keys', async () => {
    const { user } = await openSheet();
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    await screen.findByRole('radiogroup', { name: 'Signature font' });
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    const checked = () =>
      screen
        .getAllByRole('radio')
        .find((radio) => radio.getAttribute('aria-checked') === 'true')
        ?.getAttribute('aria-label');
    expect(checked()).toBe('Great Vibes');
    screen.getByRole('radio', { name: 'Great Vibes' }).focus();
    // Hold the key so the selection follows focus the way it does with a real keyboard.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(checked()).toBe('Allura'));
    await user.keyboard('{/ArrowRight}');
    await user.keyboard('{ArrowLeft>}');
    await waitFor(() => expect(checked()).toBe('Great Vibes'));
    await user.keyboard('{/ArrowLeft}');
  });

  it('explains an empty attempt instead of closing', async () => {
    const { user } = await openSheet();
    await screen.findByRole('dialog');
    const use = screen.getByRole('button', { name: 'Use this signature' });
    expect(use.getAttribute('aria-disabled')).toBe('true');
    await user.click(use);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Draw a signature first.',
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('uses a typed name straight away', async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<Harness onUse={onUse} />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    await user.click(await screen.findByRole('tab', { name: 'Type' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Type your name' }),
      'Ava Lin',
    );
    await user.click(
      screen.getByRole('button', { name: 'Use this signature' }),
    );
    expect(onUse).toHaveBeenCalledWith({
      kind: 'typed',
      text: 'Ava Lin',
      font: 'script-1',
    });
  });
});
