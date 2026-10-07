import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Monitor,
  MoreHorizontal,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { type Dispatch, type ReactNode, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx';
import type { FieldInput } from '#/core/contracts/index.ts';
import { limits } from '#/core/limits.ts';
import { countIssues, type SignerCheck } from '#/core/signer-rules.ts';
import { ulid } from '#/core/ulid.ts';
import { displayTitle } from '#/features/dashboard/format.ts';
import {
  type EditorAction,
  type EditorSigner,
  nextSignerColor,
} from '#/features/editor/reducer.ts';
import { emailMessage } from '#/features/editor/signer-rail.tsx';
import { summarizeSigner, summaryLine } from '#/features/editor/summary.ts';
import { cn } from '#/lib/utils.ts';
import '#/pdf/setup.ts';

/** The phone header: close, file name with save status and step, and a menu. */
export function MobileHeader({
  fileName,
  saveText,
  saveError,
  sending,
  onClose,
  onReplace,
}: {
  fileName: string;
  saveText: string;
  saveError: boolean;
  sending: boolean;
  onClose: () => void;
  onReplace: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Close"
        onClick={onClose}
      >
        <X strokeWidth={1.75} />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {fileName || 'Document'}
        </p>
        <p
          className={cn(
            'truncate text-xs',
            saveError ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {saveText ? `${saveText} · ` : ''}Step 2 of 3
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="More options"
          >
            <MoreHorizontal strokeWidth={1.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={sending} onSelect={onReplace}>
            Choose another PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

type ChecklistItem = { ok: boolean; text: string };

/** "Before you send", from the same signer rules as the dialog and the rail. */
function checklist(
  signers: readonly EditorSigner[],
  checks: readonly SignerCheck[],
): ChecklistItem[] {
  const nameOf = (index: number) =>
    signers[index]?.name.trim() || `Signer ${index + 1}`;
  const detail: ChecklistItem[] = [];
  const contact: ChecklistItem[] = [];
  const signing: ChecklistItem[] = [];
  checks.forEach((check, index) => {
    const name = nameOf(index);
    if (check.name) {
      contact.push({
        ok: false,
        text: `Signer ${index + 1} needs a name. Add it above.`,
      });
    }
    if (check.email === 'missing') {
      contact.push({
        ok: false,
        text: `${name} needs an email address. Add it above.`,
      });
    } else if (check.email === 'invalid') {
      contact.push({
        ok: false,
        text: `${name}'s email address is not valid. Fix it above.`,
      });
    } else if (check.email === 'duplicate') {
      contact.push({
        ok: false,
        text: `${name} shares an email address with another signer. Use a different one.`,
      });
    }
    if (check.signature) {
      signing.push({
        ok: false,
        text: `${name} needs a signature or initials field. Open this draft on a larger screen to place one.`,
      });
    }
  });
  detail.push({ ok: true, text: 'PDF uploaded and read' });
  detail.push(
    ...(contact.length > 0
      ? contact
      : [{ ok: true, text: 'Every signer has a name and email' }]),
  );
  detail.push(
    ...(signing.length > 0
      ? signing
      : [{ ok: true, text: 'Every signer has a signature or initials field' }]),
  );
  detail.push({ ok: true, text: 'Signers are in the order they should sign' });
  return detail;
}

/**
 * The phone version of the editor: no page stage and no palette. Phones add and edit
 * signers and send a draft whose fields were placed on a larger screen.
 */
export function MobileReview({
  file,
  fileName,
  pageCount,
  signers,
  fields,
  checks,
  revealErrors,
  locked,
  sending,
  dispatch,
  onReview,
}: {
  file: Blob;
  fileName: string;
  pageCount: number;
  signers: readonly EditorSigner[];
  fields: readonly FieldInput[];
  checks: readonly SignerCheck[];
  revealErrors: boolean;
  locked: boolean;
  sending: boolean;
  dispatch: Dispatch<EditorAction>;
  onReview: () => void;
}) {
  const problems = countIssues(checks);
  const blocked = problems > 0;
  const items = checklist(signers, checks);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
        <Alert variant="info">
          <Monitor aria-hidden="true" className="size-5" strokeWidth={1.75} />
          <AlertTitle>Place fields on a larger screen</AlertTitle>
          <AlertDescription>
            Dragging fields works best on a tablet or computer. You can still
            change signers and send from here once the fields are placed.
          </AlertDescription>
        </Alert>

        <section
          aria-label="Document"
          className="mt-4 flex items-center gap-4 rounded-lg border border-border bg-card p-4"
        >
          <div
            aria-hidden="true"
            className="on-paper grid h-[72px] w-14 shrink-0 place-items-center overflow-hidden rounded-sm border border-border bg-card"
          >
            <Document file={file} loading={null} error={null} noData={null}>
              <Page
                pageNumber={1}
                width={56}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={null}
              />
            </Document>
          </div>
          <div className="min-w-0">
            <p className="text-subheading font-semibold break-words">
              {displayTitle(fileName) || 'Document'}
            </p>
            <p className="text-small text-muted-foreground">
              {plural(pageCount, 'page')} ·{' '}
              {fields.length === 0
                ? 'No fields placed'
                : `${plural(fields.length, 'field')} placed`}
            </p>
          </div>
        </section>

        <h2 className="mt-6 text-[11px] leading-4 font-semibold tracking-wider text-muted-foreground uppercase">
          Signers · {signers.length}
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          {signers.map((signer, index) => (
            <MobileSigner
              key={signer.id}
              signer={signer}
              index={index}
              count={signers.length}
              fields={fields}
              check={checks[index]}
              revealErrors={revealErrors}
              locked={locked}
              dispatch={dispatch}
            />
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full"
          disabled={locked || signers.length >= limits.signersPerDocument}
          onClick={() =>
            dispatch({
              type: 'add-signer',
              signer: {
                id: ulid(),
                name: `Signer ${signers.length + 1}`,
                email: '',
                color: nextSignerColor(signers.map((s) => s.color)),
              },
            })
          }
        >
          <Plus strokeWidth={1.75} />
          Add a signer
        </Button>

        <section
          aria-labelledby="before-you-send"
          className="mt-6 rounded-lg border border-border bg-card p-5"
        >
          <h2 id="before-you-send" className="text-heading font-semibold">
            Before you send
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.text}
                className={cn(
                  'flex items-start gap-3 text-sm',
                  item.ok ? 'text-success-fg' : 'text-danger-fg',
                )}
              >
                {item.ok ? (
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0"
                    strokeWidth={1.75}
                  />
                ) : (
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0"
                    strokeWidth={1.75}
                  />
                )}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p
          id="send-helper"
          className={cn(
            'mb-3 text-center text-small',
            blocked ? 'text-warning-fg' : 'text-success-fg',
          )}
        >
          {blocked
            ? `Fix ${plural(problems, 'thing')} to send this document.`
            : 'Everything is in place.'}
        </p>
        <Button
          type="button"
          size="lg"
          className={cn(
            'h-12 w-full text-base',
            (blocked || sending || locked) && 'cursor-not-allowed opacity-50',
          )}
          aria-disabled={blocked || sending || locked}
          aria-describedby="send-helper"
          onClick={() => {
            if (blocked || sending || locked) return;
            onReview();
          }}
        >
          {sending ? 'Sending…' : 'Review and send'}
        </Button>
      </div>
    </div>
  );
}

function MobileSigner({
  signer,
  index,
  count,
  fields,
  check,
  revealErrors,
  locked,
  dispatch,
}: {
  signer: EditorSigner;
  index: number;
  count: number;
  fields: readonly FieldInput[];
  check: SignerCheck | undefined;
  revealErrors: boolean;
  locked: boolean;
  dispatch: Dispatch<EditorAction>;
}) {
  const [emailTouched, setEmailTouched] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const summary = summarizeSigner(signer.id, fields);
  const emailError = emailMessage(
    check?.email ?? null,
    emailTouched || revealErrors,
  );
  const nameError = check?.name && (revealErrors || signer.name.length > 0);
  const name = signer.name.trim() || 'this signer';
  return (
    <li className="relative overflow-hidden rounded-lg border border-border bg-card py-4 pr-3 pl-5">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: signer.color }}
      />
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold"
          style={{ borderColor: signer.color }}
        >
          {index + 1}
        </span>
        <input
          aria-label={`Name for signer ${index + 1}`}
          value={signer.name}
          maxLength={80}
          disabled={locked}
          aria-invalid={check?.name ? true : undefined}
          className="h-11 min-w-0 flex-1 rounded-md bg-transparent px-1 text-subheading font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) =>
            dispatch({
              type: 'rename-signer',
              id: signer.id,
              name: event.target.value,
            })
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={`Options for ${name}`}
              disabled={locked}
            >
              <MoreHorizontal strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="min-h-11"
              disabled={index === 0}
              onSelect={() =>
                dispatch({
                  type: 'reorder-signers',
                  from: index,
                  to: index - 1,
                })
              }
            >
              <ChevronUp />
              Move earlier
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              disabled={index === count - 1}
              onSelect={() =>
                dispatch({
                  type: 'reorder-signers',
                  from: index,
                  to: index + 1,
                })
              }
            >
              <ChevronDown />
              Move later
            </DropdownMenuItem>
            {count > 1 ? (
              <DropdownMenuItem
                className="min-h-11 text-destructive"
                onSelect={() => setConfirmRemove(true)}
              >
                <Trash2 />
                Remove signer
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input
        aria-label={`Email for signer ${index + 1}`}
        type="email"
        inputMode="email"
        autoComplete="off"
        value={signer.email}
        maxLength={200}
        placeholder="Email"
        disabled={locked}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? `m-email-error-${signer.id}` : undefined}
        className="mt-2 h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none placeholder:text-ink-subtle focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
        onBlur={() => setEmailTouched(true)}
        onChange={(event) =>
          dispatch({
            type: 'set-signer-email',
            id: signer.id,
            email: event.target.value,
          })
        }
      />
      {emailError ? (
        <Note id={`m-email-error-${signer.id}`} tone="danger">
          {emailError}
        </Note>
      ) : null}
      {nameError ? (
        <Note tone="danger">Enter a name for this signer.</Note>
      ) : null}
      <p
        className={cn(
          'mt-2 flex items-center gap-2 text-small',
          summary.needsSignature ? 'text-warning-fg' : 'text-muted-foreground',
        )}
      >
        {summary.needsSignature ? (
          <TriangleAlert
            aria-hidden="true"
            className="size-4 shrink-0 text-warning"
            strokeWidth={1.75}
          />
        ) : (
          <CircleCheck
            aria-hidden="true"
            className="size-4 shrink-0 text-success"
            strokeWidth={1.75}
          />
        )}
        {summaryLine(summary)}
      </p>
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their fields will come off this document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep signer</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => dispatch({ type: 'remove-signer', id: signer.id })}
            >
              Remove signer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function Note({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: 'danger';
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={cn('mt-1.5 text-small', tone === 'danger' && 'text-danger-fg')}
    >
      {children}
    </p>
  );
}
