import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { Button } from '#/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '#/components/ui/dialog.tsx';
import { Input } from '#/components/ui/input.tsx';
import { Label } from '#/components/ui/label.tsx';
import { limits } from '#/core/limits.ts';
import { displayTitle } from '#/features/dashboard/format.ts';
import type { TemplateDetail } from '#/server/domain/templates.ts';
import { createFromTemplateFn, getTemplateFn } from '#/server/templates.ts';

type Form = {
  title: string;
  signers: { slotId: string; name: string; email: string }[];
  prefills: { fieldId: string; label: string; text: string }[];
};

function formFor(template: TemplateDetail): Form {
  return {
    title: displayTitle(template.name),
    signers: template.slots.map((slot) => ({
      slotId: slot.id,
      name: slot.name,
      email: slot.email,
    })),
    prefills: template.prefills.map((item) => ({
      fieldId: item.fieldId,
      label: item.label,
      text: item.text,
    })),
  };
}

const LEGEND =
  'mb-1 text-[11px] leading-4 font-semibold tracking-wider text-muted-foreground uppercase';

/**
 * Fill in a template before it becomes a document: the title, who signs, and the text the
 * template leaves blank. Everything stays editable in the editor afterwards.
 */
export function UseTemplateDialog({
  templateId,
  onClose,
}: {
  templateId: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTemplate(null);
    setForm(null);
    setError('');
    if (!templateId) return;
    let cancelled = false;
    void getTemplateFn({ data: { templateId } }).then((result) => {
      if (cancelled) return;
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setTemplate(result);
      setForm(formFor(result));
    });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function create() {
    if (!templateId || !form || busy) return;
    const title = form.title.trim();
    if (!title) {
      setError('Give the document a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const made = await createFromTemplateFn({
        data: {
          templateId,
          title,
          signers: form.signers,
          prefills: form.prefills.map((item) => ({
            fieldId: item.fieldId,
            text: item.text,
          })),
        },
      });
      if ('error' in made) {
        setError(made.error);
        return;
      }
      await navigate({
        to: '/prepare',
        search: { documentId: made.documentId },
      });
    } finally {
      setBusy(false);
    }
  }

  function patchSigner(index: number, patch: Partial<Form['signers'][number]>) {
    setForm((current) =>
      current
        ? {
            ...current,
            signers: current.signers.map((item, at) =>
              at === index ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  }

  function patchPrefill(index: number, text: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            prefills: current.prefills.map((item, at) =>
              at === index ? { ...item, text } : item,
            ),
          }
        : current,
    );
  }

  return (
    <Dialog
      open={templateId !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent sheet aria-describedby="use-template-hint">
        <div>
          <DialogTitle>
            {template ? `Use "${displayTitle(template.name)}"` : 'Use template'}
          </DialogTitle>
          <DialogDescription id="use-template-hint" className="mt-1">
            Fill in what changes this time. You can still edit everything in the
            editor before it is sent.
          </DialogDescription>
        </div>
        {form && template ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="use-title">Document title</Label>
              <Input
                id="use-title"
                value={form.title}
                maxLength={200}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </div>
            {form.prefills.length > 0 ? (
              <fieldset className="flex flex-col gap-3">
                <legend className={LEGEND}>Text on the document</legend>
                {form.prefills.map((item, index) => (
                  <div key={item.fieldId} className="flex flex-col gap-1.5">
                    <Label htmlFor={`use-prefill-${item.fieldId}`}>
                      {item.label}
                    </Label>
                    <Input
                      id={`use-prefill-${item.fieldId}`}
                      value={item.text}
                      maxLength={limits.textFieldChars}
                      onChange={(event) =>
                        patchPrefill(index, event.target.value)
                      }
                    />
                  </div>
                ))}
              </fieldset>
            ) : null}
            <fieldset className="flex flex-col gap-3">
              <legend className={LEGEND}>Who signs, in order</legend>
              {form.signers.map((signer, index) => (
                <div key={signer.slotId} className="grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`use-name-${signer.slotId}`}>
                      {index + 1}. Name
                    </Label>
                    <Input
                      id={`use-name-${signer.slotId}`}
                      value={signer.name}
                      maxLength={80}
                      onChange={(event) =>
                        patchSigner(index, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`use-email-${signer.slotId}`}>Email</Label>
                    <Input
                      id={`use-email-${signer.slotId}`}
                      type="email"
                      value={signer.email}
                      maxLength={200}
                      placeholder="name@example.com"
                      onChange={(event) =>
                        patchSigner(index, { email: event.target.value })
                      }
                    />
                  </div>
                </div>
              ))}
            </fieldset>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? 'Creating…' : 'Create document'}
              </Button>
            </DialogFooter>
          </form>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
