import { Link, useRouter } from '@tanstack/react-router';
import { FileStack, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog.tsx';
import { Button } from '#/components/ui/button.tsx';
import {
  displayTitle,
  formatRelative,
  formatWhen,
} from '#/features/dashboard/format.ts';
import { UseTemplateDialog } from '#/features/templates/use-template-dialog.tsx';
import type { TemplateSummary } from '#/server/domain/templates.ts';
import { deleteTemplateFn } from '#/server/templates.ts';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function TemplatesPage({
  templates,
  error,
}: {
  templates: readonly TemplateSummary[];
  error: string | null;
}) {
  const router = useRouter();
  const [using, setUsing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TemplateSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!removing || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteTemplateFn({
        data: { templateId: removing.id },
      });
      if ('error' in result) {
        toast(result.error);
        return;
      }
      setRemoving(null);
      await router.invalidate();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <h1 className="text-title font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 max-w-[60ch] text-muted-foreground">
            {templates.length === 0
              ? 'Save a document once, with its fields and the text you fill in each time, then reuse it.'
              : 'Reuse a document you send often. Pick one, fill in what changes, and send.'}
          </p>
        </div>
        <Button asChild size="lg" className="h-11 w-full md:h-10 md:w-auto">
          <Link to="/prepare" search={{ kind: 'template' }}>
            <Plus strokeWidth={1.75} />
            New template
          </Link>
        </Button>
      </div>

      {error ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : templates.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-lg border border-border bg-card px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-md bg-accent text-muted-foreground"
          >
            <FileStack className="size-6" strokeWidth={1.75} />
          </span>
          <h2 className="mt-4 text-heading font-semibold">No templates yet</h2>
          <p className="mt-1 max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
            Upload a PDF, place the signature fields, and add prefilled text
            fields for the parts you fill in each time, like a client name or an
            amount.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-4 md:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {displayTitle(template.name)}
                </p>
                <p className="mt-0.5 text-small text-muted-foreground">
                  {plural(template.pageCount, 'page')} ·{' '}
                  {plural(template.signerCount, 'signer')} ·{' '}
                  {plural(template.fieldCount, 'field')}
                  {template.prefilledCount > 0
                    ? ` (${template.prefilledCount} prefilled)`
                    : ''}{' '}
                  ·{' '}
                  <time
                    dateTime={new Date(template.updatedAt).toISOString()}
                    title={formatWhen(template.updatedAt)}
                  >
                    updated {formatRelative(template.updatedAt)}
                  </time>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="h-11 flex-1 md:h-10 md:flex-none"
                  disabled={!template.ready || template.signerCount === 0}
                  onClick={() => setUsing(template.id)}
                >
                  Use template
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="size-11 md:size-10"
                >
                  <Link
                    to="/prepare"
                    search={{ documentId: template.id, kind: 'template' }}
                    aria-label={`Edit ${displayTitle(template.name)}`}
                  >
                    <Pencil strokeWidth={1.75} />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 md:size-10"
                  aria-label={`Delete ${displayTitle(template.name)}`}
                  onClick={() => setRemoving(template)}
                >
                  <Trash2 strokeWidth={1.75} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <UseTemplateDialog templateId={using} onClose={() => setUsing(null)} />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? `"${displayTitle(removing.name)}" ` : ''}will be
              removed. Documents you already made from it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
