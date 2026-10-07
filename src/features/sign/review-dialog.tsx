import { LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';

import { Alert, AlertDescription } from '#/components/ui/alert.tsx';
import { Button } from '#/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog.tsx';
import type { FieldInput, FieldValue } from '#/core/contracts/index.ts';
import { FIELD_LABEL } from '#/features/editor/reducer.ts';
import { SignatureImage } from '#/features/sign/ink-graphic.tsx';

export const CONSENT_TEXT =
  'I agree to sign this document electronically. This signature is as binding as one written by hand.';

export type SummaryRow = {
  id: string;
  label: string;
  value:
    | { kind: 'signature'; signature: NonNullable<FieldValue['signature']> }
    | { kind: 'text'; text: string }
    | { kind: 'ticked'; ticked: boolean };
};

/** What the signer is about to sign, one row per field they filled in. */
export function summaryRows(
  fields: readonly FieldInput[],
  answers: readonly FieldValue[],
): SummaryRow[] {
  const counts: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const field of fields) total[field.kind] = (total[field.kind] ?? 0) + 1;
  const rows: SummaryRow[] = [];
  for (const field of fields) {
    if (
      field.kind !== 'signature' &&
      field.kind !== 'initials' &&
      field.kind !== 'text' &&
      field.kind !== 'checkbox'
    ) {
      continue;
    }
    counts[field.kind] = (counts[field.kind] ?? 0) + 1;
    const label =
      (total[field.kind] ?? 0) > 1
        ? `${FIELD_LABEL[field.kind]} ${counts[field.kind]}`
        : FIELD_LABEL[field.kind];
    const value = answers.find((item) => item.fieldId === field.id);
    if (field.kind === 'checkbox') {
      rows.push({
        id: field.id,
        label,
        value: { kind: 'ticked', ticked: value?.checked === true },
      });
    } else if (field.kind === 'text') {
      if (value?.text?.trim()) {
        rows.push({
          id: field.id,
          label,
          value: { kind: 'text', text: value.text.trim() },
        });
      }
    } else if (value?.signature) {
      rows.push({
        id: field.id,
        label,
        value: { kind: 'signature', signature: value.signature },
      });
    }
  }
  return rows;
}

export function ReviewDialog({
  open,
  onOpenChange,
  title,
  signerName,
  nextSignerName,
  rows,
  consent,
  onConsent,
  busy,
  error,
  onSign,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  signerName: string;
  nextSignerName: string | null;
  rows: SummaryRow[];
  consent: boolean;
  onConsent: (value: boolean) => void;
  busy: boolean;
  error: string;
  onSign: () => void;
  onDecline: () => void;
}) {
  const [about, setAbout] = useState(false);
  const hintId = useId();
  const blocked = !consent || busy;
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent
          sheet
          className="gap-4 p-4 sm:p-6 md:max-w-lg"
          closeLabel="Close"
          showClose={false}
        >
          <div
            aria-hidden="true"
            className="mx-auto -mt-1 h-1 w-10 rounded-full bg-border md:hidden"
          />
          <DialogTitle>Ready to sign?</DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            You are signing{' '}
            <strong className="font-semibold text-foreground">{title}</strong>{' '}
            as{' '}
            <strong className="font-semibold text-foreground">
              {signerName}
            </strong>
            .
            {nextSignerName ? (
              <span className="hidden md:inline">
                {' '}
                {nextSignerName} is asked to sign after you.
              </span>
            ) : null}
          </DialogDescription>

          {rows.length > 0 ? (
            <dl className="divide-y divide-border rounded-lg border border-border">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 text-right font-medium text-foreground">
                    {row.value.kind === 'signature' ? (
                      <span className="on-paper block h-9 w-40">
                        <SignatureImage
                          signature={row.value.signature}
                          className="h-full w-full"
                        />
                      </span>
                    ) : row.value.kind === 'text' ? (
                      <span className="break-words">{row.value.text}</span>
                    ) : row.value.ticked ? (
                      <span className="text-success-fg">Ticked</span>
                    ) : (
                      <span className="text-muted-foreground">Not ticked</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <label className="flex items-start gap-3 text-foreground">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-primary"
              checked={consent}
              onChange={(event) => onConsent(event.target.checked)}
            />
            <span>
              {CONSENT_TEXT}{' '}
              <button
                type="button"
                className="font-medium text-brand-fg underline underline-offset-2 max-sm:min-h-11"
                onClick={() => setAbout(true)}
              >
                How electronic signing works
              </button>
            </span>
          </label>

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="mt-0">{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="h-12 w-full text-base"
              aria-disabled={blocked}
              aria-describedby={consent ? undefined : hintId}
              onClick={() => {
                if (!blocked) onSign();
              }}
            >
              {busy ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-5 animate-spin motion-reduce:animate-none"
                  />
                  Recording your signature…
                </>
              ) : (
                'Sign document'
              )}
            </Button>
            {consent ? null : (
              <p
                id={hintId}
                className="text-center text-small text-muted-foreground"
              >
                Tick the box above to sign.
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Go back
            </Button>
          </div>
          <div className="border-t border-border pt-3 text-center">
            <button
              type="button"
              className="text-sm font-medium text-destructive underline-offset-2 hover:underline max-sm:min-h-11"
              disabled={busy}
              onClick={onDecline}
            >
              Decline to sign
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="max-w-md" closeLabel="Close">
          <DialogTitle>How electronic signing works</DialogTitle>
          <DialogDescription>
            {/* TODO(legal): replace with the approved electronic-signing explanation. */}
            This text is being prepared.
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
}
