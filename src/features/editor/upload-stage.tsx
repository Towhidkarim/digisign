import { Link } from '@tanstack/react-router';
import {
  Circle,
  CircleCheck,
  FileText,
  Loader2,
  Pencil,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import type { DragEvent, RefObject } from 'react';

import { AppHeader } from '#/components/app-header.tsx';
import { Stepper } from '#/components/stepper.tsx';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx';
import { Button, buttonVariants } from '#/components/ui/button.tsx';
import { cn } from '#/lib/utils.ts';

/** Which part of reading a chosen file is running. */
export type ReadingStep = 'checking' | 'reading' | 'saving';

const CHECKLIST: readonly { step: ReadingStep; label: string }[] = [
  { step: 'checking', label: 'Checked the file' },
  { step: 'reading', label: 'Reading the pages' },
  { step: 'saving', label: 'Saving your draft' },
];

const ORDER: readonly ReadingStep[] = ['checking', 'reading', 'saving'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "First sentence. Second sentence." becomes a title and a body. One sentence is title only. */
function splitMessage(message: string): { title: string; body: string } {
  const match = /^(.+?[.!?])\s+(.+)$/s.exec(message.trim());
  return match
    ? { title: match[1] ?? message, body: match[2] ?? '' }
    : { title: message.trim(), body: '' };
}

export type UploadStageProps = {
  inputId: string;
  fileRef: RefObject<HTMLInputElement | null>;
  phase: 'idle' | 'reading' | 'opening';
  step: ReadingStep;
  picked: { name: string; size: number } | null;
  over: boolean;
  error: string;
  /** Shown when the tab's saved draft could not keep its PDF. */
  needsFile: boolean;
  resume: { title: string } | null;
  onResume: () => void;
  dragHandlers: {
    onDragEnter: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
};

/** The first prepare step: choose a PDF. */
export function UploadStage(props: UploadStageProps) {
  const { phase, error, needsFile, resume } = props;
  const busy = phase !== 'idle';
  const notice = error || (needsFile && !busy ? NEEDS_FILE : '');
  return (
    <>
      <AppHeader home="/dashboard" bordered>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard">
            <X strokeWidth={1.75} />
            Close
          </Link>
        </Button>
      </AppHeader>
      <main className="min-h-0 flex-1 overflow-auto px-4 pb-16 sm:px-6">
        <Stepper current={0} className="mx-auto mt-6 sm:mt-8" />
        <div className="mx-auto mt-8 w-full max-w-2xl sm:mt-12">
          <h1 className="text-title font-semibold tracking-tight">
            Upload your PDF
          </h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-muted-foreground">
            Place the fields, name who signs and in what order, then send. Until
            you send, the document stays a draft.
          </p>
          {notice && !busy ? <ErrorAlert message={notice} /> : null}
          {phase === 'reading' && props.picked ? (
            <ReadingCard picked={props.picked} step={props.step} />
          ) : phase === 'opening' ? (
            <OpeningCard />
          ) : (
            <DropZone {...props} />
          )}
          {resume && !busy ? (
            <ResumeCard title={resume.title} onResume={props.onResume} />
          ) : null}
        </div>
      </main>
    </>
  );
}

const NEEDS_FILE =
  'This document was too large to keep in the tab. Choose the PDF again.';

function ErrorAlert({ message }: { message: string }) {
  const { title, body } = splitMessage(message);
  return (
    <Alert variant="destructive" className="mt-6">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {body ? (
        <AlertDescription className="mt-0">{body}</AlertDescription>
      ) : null}
    </Alert>
  );
}

function DropZone({
  inputId,
  over,
  dragHandlers,
}: Pick<UploadStageProps, 'inputId' | 'over' | 'dragHandlers'>) {
  return (
    <label
      htmlFor={inputId}
      {...dragHandlers}
      className={cn(
        'mt-6 flex cursor-pointer flex-col items-center rounded-lg border-2 px-5 py-10 text-center transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 sm:min-h-72 sm:justify-center sm:py-14',
        over
          ? 'border-primary bg-brand-bg'
          : 'border-dashed border-input bg-card',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-14 place-items-center rounded-full',
          over ? 'text-brand-fg' : 'bg-brand-bg text-brand-fg',
        )}
      >
        <Upload className="size-6" strokeWidth={1.75} />
      </span>
      <span className="mt-4 text-heading font-semibold">
        {over ? 'Drop it to open' : 'Drop a PDF here'}
      </span>
      <span className="mt-1 text-sm text-muted-foreground">
        {over
          ? 'Let go to start reading the file.'
          : 'or choose a file from your computer'}
      </span>
      {over ? null : (
        <span
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'mt-5 h-11 w-full bg-card sm:h-10 sm:w-auto',
          )}
        >
          Choose a file
        </span>
      )}
      <span className="mt-4 text-small text-ink-subtle">
        PDF only. Up to 25 MB and 200 pages.
      </span>
    </label>
  );
}

function ReadingCard({
  picked,
  step,
}: {
  picked: { name: string; size: number };
  step: ReadingStep;
}) {
  const at = ORDER.indexOf(step);
  return (
    <output
      aria-live="polite"
      className="mt-6 block rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-muted-foreground"
        >
          <FileText className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-subheading font-semibold">
            {picked.name}
          </p>
          <p className="text-small text-muted-foreground">
            {formatBytes(picked.size)}
          </p>
        </div>
      </div>
      <Bar />
      <ul className="mt-5 flex flex-col gap-3">
        {CHECKLIST.map((item, index) => {
          const state = index < at ? 'done' : index === at ? 'current' : 'todo';
          return (
            <li
              key={item.step}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex items-center gap-3 text-sm"
            >
              {state === 'done' ? (
                <CircleCheck
                  aria-hidden="true"
                  className="size-5 text-success"
                  strokeWidth={1.75}
                />
              ) : state === 'current' ? (
                <Loader2
                  aria-hidden="true"
                  className="size-5 animate-spin text-primary motion-reduce:animate-none"
                  strokeWidth={1.75}
                />
              ) : (
                <Circle
                  aria-hidden="true"
                  className="size-5 text-ink-subtle"
                  strokeWidth={1.75}
                />
              )}
              <span
                className={cn(
                  state === 'current'
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {item.label}
                <span className="sr-only">
                  {state === 'done'
                    ? ' (done)'
                    : state === 'current'
                      ? ' (in progress)'
                      : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-small text-muted-foreground">
        This takes a few seconds. Nobody is notified until you send.
      </p>
    </output>
  );
}

function OpeningCard() {
  return (
    <output
      aria-live="polite"
      className="mt-6 block rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <p className="text-subheading font-semibold">Opening the draft…</p>
      <Bar />
    </output>
  );
}

/** An indeterminate bar. With reduced motion it holds still at a fixed fill. */
function Bar() {
  return (
    <div
      aria-hidden="true"
      className="mt-5 h-1 overflow-hidden rounded-full bg-brand-soft"
    >
      <div className="h-full w-2/5 rounded-full bg-primary animate-indeterminate motion-reduce:animate-none" />
    </div>
  );
}

function ResumeCard({
  title,
  onResume,
}: {
  title: string;
  onResume: () => void;
}) {
  return (
    <section
      aria-label="Continue a draft"
      className="mt-6 flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-muted-foreground"
        >
          <Pencil className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-subheading font-semibold">{title}</p>
          <p className="text-small text-muted-foreground">
            Draft you were working on in this tab
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 w-full sm:h-10 sm:w-auto"
        onClick={onResume}
      >
        Continue draft
      </Button>
    </section>
  );
}
