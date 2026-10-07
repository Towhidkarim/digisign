import { Asterisk, Check, ChevronDown, MoreHorizontal } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Document, Page } from 'react-pdf';

import { Button } from '#/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx';
import type { FieldInput, FieldValue } from '#/core/contracts/index.ts';
import { microToPercent, viewSize } from '#/core/coords.ts';
import { limits } from '#/core/limits.ts';
import { FIELD_LABEL } from '#/features/editor/reducer.ts';
import { CaptureSheet } from '#/features/sign/capture-sheet.tsx';
import { Confirmation } from '#/features/sign/confirmation.tsx';
import { DeclineDialog } from '#/features/sign/decline-dialog.tsx';
import {
  clearEntries,
  type FieldState,
  fieldState,
  INVITE_TOKEN_KEY,
  keyFor,
  loadEntries,
  type Progress,
  progressAlt,
  progressLabel,
  progressOf,
  requiredFields,
  SEGMENT_LIMIT,
  saveEntries,
} from '#/features/sign/desk-model.ts';
import { InkGraphic } from '#/features/sign/ink-graphic.tsx';
import { ReviewDialog, summaryRows } from '#/features/sign/review-dialog.tsx';
import {
  ConnectionLostScreen,
  GenericProblemScreen,
  InviteReasonScreen,
  type Sender,
  SessionTimedOutScreen,
  SignerPage,
} from '#/features/sign/signer-status.tsx';
import {
  CONNECTION_MESSAGE,
  declineSignature,
  fetchSource,
  loadView,
  type Problem,
  reopenSession,
  submitSignature,
} from '#/features/sign/signing-client.ts';
import { SigningSkeleton } from '#/features/sign/signing-skeleton.tsx';
import { useMediaQuery } from '#/hooks/use-media-query.ts';
import { cn } from '#/lib/utils.ts';
import { installScriptFaces } from '#/pdf/fonts.ts';
import '#/pdf/setup.ts';
import type { SigningView } from '#/server/domain/signing.ts';

type Ready = Extract<SigningView, { kind: 'ready' }>;

type Screen =
  | { t: 'loading' }
  | { t: 'problem'; problem: Problem }
  | { t: 'ready'; view: Ready; bytes: Uint8Array }
  | { t: 'signed'; view: Ready; signedAt: number }
  | { t: 'done'; view: SigningView; bytes: Uint8Array | null };

function senderOf(view: SigningView): Sender {
  return {
    name: view.sender.name,
    email: view.sender.email,
    title: view.title,
  };
}

export function SigningDesk() {
  const [screen, setScreen] = useState<Screen>({ t: 'loading' });
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState('');

  const load = useCallback(async () => {
    setScreen({ t: 'loading' });
    const loaded = await loadView();
    if ('problem' in loaded) {
      setScreen({ t: 'problem', problem: loaded.problem });
      return;
    }
    const { view } = loaded;
    if (view.kind === 'ready' || view.kind === 'completed') {
      const source = await fetchSource(view);
      if ('error' in source) {
        setScreen({
          t: 'problem',
          problem: { kind: 'other', message: source.error },
        });
        return;
      }
      setScreen(
        view.kind === 'ready'
          ? { t: 'ready', view, bytes: source.bytes }
          : { t: 'done', view, bytes: source.bytes },
      );
      return;
    }
    setScreen({ t: 'done', view, bytes: null });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function continueSigning() {
    setBusy(true);
    setRetryError('');
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(INVITE_TOKEN_KEY);
    } catch {
      token = null;
    }
    if (!token) {
      setBusy(false);
      setScreen({
        t: 'problem',
        problem: { kind: 'invite', reason: 'expired', sender: null },
      });
      return;
    }
    const reopened = await reopenSession(token);
    setBusy(false);
    if ('problem' in reopened) {
      if (reopened.problem.kind === 'network') {
        setRetryError(reopened.problem.message);
        return;
      }
      setScreen({ t: 'problem', problem: reopened.problem });
      return;
    }
    await load();
  }

  switch (screen.t) {
    case 'loading':
      return <SigningSkeleton />;
    case 'problem':
      return (
        <SignerPage>
          <ProblemScreen
            problem={screen.problem}
            busy={busy}
            error={retryError}
            onContinue={() => void continueSigning()}
            onRetry={() => void load()}
          />
        </SignerPage>
      );
    case 'ready':
      return (
        <Walk
          key={screen.view.you.id}
          view={screen.view}
          bytes={screen.bytes}
          onSigned={(signedAt) =>
            setScreen({ t: 'signed', view: screen.view, signedAt })
          }
          onCompleted={() => void load()}
          onReload={() => void load()}
          onProblem={(problem) => setScreen({ t: 'problem', problem })}
        />
      );
    case 'signed': {
      const { view } = screen;
      const next =
        view.others.find((other) => other.order === view.you.order + 1)?.name ??
        null;
      return (
        <Confirmation
          kind="signed"
          common={{
            title: view.title,
            documentId: view.documentId,
            youName: view.you.name,
            senderName: view.sender.name,
            senderEmail: view.sender.email,
          }}
          signedAt={screen.signedAt}
          nextSignerName={next}
        />
      );
    }
    case 'done':
      return <FinishedView view={screen.view} bytes={screen.bytes} />;
  }
}

function ProblemScreen({
  problem,
  busy,
  error,
  onContinue,
  onRetry,
}: {
  problem: Problem;
  busy: boolean;
  error: string;
  onContinue: () => void;
  onRetry: () => void;
}) {
  switch (problem.kind) {
    case 'session':
      return (
        <SessionTimedOutScreen
          onContinue={onContinue}
          busy={busy}
          error={error}
          sender={null}
        />
      );
    case 'network':
      return (
        <ConnectionLostScreen onRetry={onRetry} busy={false} sender={null} />
      );
    case 'invite':
      return (
        <InviteReasonScreen reason={problem.reason} sender={problem.sender} />
      );
    case 'other':
      return <GenericProblemScreen message={problem.message} />;
  }
}

/** What a signer sees when they are not waiting: signed, declined, or the document stopped. */
function FinishedView({
  view,
  bytes,
}: {
  view: SigningView;
  bytes: Uint8Array | null;
}) {
  const common = {
    title: view.title,
    documentId: view.documentId,
    youName: view.you.name,
    senderName: view.sender.name,
    senderEmail: view.sender.email,
  };
  switch (view.kind) {
    case 'completed':
      return (
        <Confirmation
          kind="complete"
          common={common}
          youId={view.you.id}
          completedAt={view.signedAt}
          records={view.records}
          source={bytes ? { view, bytes } : null}
        />
      );
    case 'signed-waiting':
      return (
        <Confirmation
          kind="waiting"
          common={common}
          youOrder={view.you.order}
          signedAt={view.signedAt}
          nextSignerName={view.nextSignerName}
          others={view.others}
        />
      );
    case 'declined-by-you':
      return (
        <Confirmation
          kind="declined"
          common={common}
          declinedAt={view.declinedAt}
          reason={view.reason}
        />
      );
    case 'stopped':
      return (
        <SignerPage>
          <InviteReasonScreen reason="stopped" sender={senderOf(view)} />
        </SignerPage>
      );
    case 'voided':
      return (
        <SignerPage>
          <InviteReasonScreen reason="cancelled" sender={senderOf(view)} />
        </SignerPage>
      );
    case 'expired':
      return (
        <SignerPage>
          <InviteReasonScreen reason="expired" sender={senderOf(view)} />
        </SignerPage>
      );
    case 'ready':
      return null;
  }
}

type Zoom = { mode: 'fit' } | { mode: 'percent'; percent: number };
const ZOOM_PERCENTS = [50, 75, 100, 125, 150, 200] as const;
const CSS_PX_PER_PT = 96 / 72;

function Walk({
  view,
  bytes,
  onSigned,
  onCompleted,
  onReload,
  onProblem,
}: {
  view: Ready;
  bytes: Uint8Array;
  onSigned: (signedAt: number) => void;
  onCompleted: () => void;
  onReload: () => void;
  onProblem: (problem: Problem) => void;
}) {
  const file = useMemo(() => pdfBlob(bytes), [bytes]);
  const [answers, setAnswers] = useState<FieldValue[]>(() =>
    loadEntries(view.documentId, view.you.id, view.fields),
  );
  const [consent, setConsent] = useState(false);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [lost, setLost] = useState(false);
  const [zoom, setZoom] = useState<Zoom>({ mode: 'fit' });
  const [frameWidth, setFrameWidth] = useState(720);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<{ key: string; body: string } | null>(null);
  const touch = useMediaQuery('(pointer: coarse)');

  const progress = useMemo(
    () => progressOf(view.fields, answers),
    [view.fields, answers],
  );
  const prior = view.records.flatMap((record) => record.values);

  useEffect(() => {
    saveEntries(view.documentId, view.you.id, answers);
  }, [answers, view.documentId, view.you.id]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const measure = () => {
      const pad = window.innerWidth < 768 ? 16 : 48;
      setFrameWidth(Math.max(280, node.clientWidth - pad * 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void installScriptFaces();
  }, []);

  const firstPage = view.upload.geometry[0];
  const firstView = firstPage
    ? viewSize(firstPage)
    : { viewW: 612, viewH: 792 };
  const currentPercent = Math.round(
    (pagePixels(firstView.viewW, firstView.viewH, zoom, frameWidth).width /
      (firstView.viewW * CSS_PX_PER_PT)) *
      100,
  );

  function stepZoom(direction: 1 | -1) {
    const next =
      direction === 1
        ? ZOOM_PERCENTS.find((percent) => percent > currentPercent)
        : [...ZOOM_PERCENTS]
            .reverse()
            .find((percent) => percent < currentPercent);
    if (next) setZoom({ mode: 'percent', percent: next });
  }

  function control(id: string): HTMLElement | null {
    return (
      scrollerRef.current?.querySelector<HTMLElement>(
        `[data-field-id="${id}"] [data-control]`,
      ) ?? null
    );
  }

  function focusField(id: string, activate: boolean) {
    const target = control(id);
    if (!target) return;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    target.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
    });
    target.focus({ preventScroll: true });
    const field = view.fields.find((item) => item.id === id);
    if (
      activate &&
      field &&
      (field.kind === 'signature' || field.kind === 'initials')
    ) {
      setCaptureId(id);
    }
  }

  function primary() {
    if (progress.left > 0 && progress.currentId) {
      focusField(progress.currentId, true);
      return;
    }
    setError('');
    setReviewOpen(true);
  }

  async function sign() {
    if (busy) return;
    setBusy(true);
    setError('');
    const core = {
      stateHash: view.stateHash,
      consent: true as const,
      values: answers,
    };
    // The same request keeps the same key, so a retry after a dropped connection cannot sign twice.
    keyRef.current = keyFor(keyRef.current, JSON.stringify(core));
    const out = await submitSignature({
      idempotencyKey: keyRef.current.key,
      ...core,
    });
    setBusy(false);
    if ('network' in out) {
      setReviewOpen(false);
      setLost(true);
      return;
    }
    if ('error' in out) {
      setLost(false);
      if (out.reason === 'session') {
        setReviewOpen(false);
        onProblem({ kind: 'session', message: out.error });
        return;
      }
      setReviewOpen(true);
      setError(out.error);
      return;
    }
    clearEntries(view.documentId, view.you.id);
    keyRef.current = null;
    if (out.ok.status === 'completed') onCompleted();
    else onSigned(out.ok.signedAt);
  }

  async function decline(reason: string) {
    setBusy(true);
    setDeclineError('');
    const out = await declineSignature(reason);
    setBusy(false);
    if ('network' in out) {
      setDeclineError(CONNECTION_MESSAGE);
      return;
    }
    if ('error' in out) {
      if (out.reason === 'session') {
        setDeclineOpen(false);
        onProblem({ kind: 'session', message: out.error });
        return;
      }
      setDeclineError(out.error);
      return;
    }
    clearEntries(view.documentId, view.you.id);
    onReload();
  }

  if (lost) {
    return (
      <SignerPage>
        <ConnectionLostScreen
          busy={busy}
          sender={{
            name: view.sender.name,
            email: view.sender.email,
            title: view.title,
          }}
          onRetry={() => void sign()}
        />
      </SignerPage>
    );
  }

  const capturing = view.fields.find((field) => field.id === captureId);
  const nextName =
    view.others.find((other) => other.order === view.you.order + 1)?.name ??
    null;
  const label = progress.left > 0 ? 'Next field' : 'Review and sign';

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
        >
          D
        </span>
        <div className="min-w-0 flex-1 md:flex-none md:basis-72">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {view.title}
          </h1>
          <p className="truncate text-small text-muted-foreground">
            <span className="md:hidden">
              Signing as {view.you.name} · {view.you.order} of {view.count}
            </span>
            <span className="hidden md:inline">
              Sent by {view.sender.name || 'the sender'} · You are signer{' '}
              {view.you.order} of {view.count}
            </span>
          </p>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex lg:justify-center">
          <ProgressBar progress={progress} className="w-28 shrink-0 lg:w-48" />
          <span
            className={cn(
              'text-sm font-semibold whitespace-nowrap',
              progress.complete ? 'text-success-fg' : 'text-foreground',
            )}
          >
            {progressLabel(progress)}
          </span>
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            className="pointer-coarse:size-11"
            onClick={() => stepZoom(-1)}
          >
            <span aria-hidden="true">−</span>
          </Button>
          <span className="w-12 text-center text-sm tabular-nums">
            {currentPercent}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            className="pointer-coarse:size-11"
            onClick={() => stepZoom(1)}
          >
            <span aria-hidden="true">+</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={zoom.mode === 'fit'}
            className="pointer-coarse:min-h-11 aria-pressed:bg-accent"
            onClick={() => setZoom({ mode: 'fit' })}
          >
            Fit width
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="max-md:size-11 pointer-coarse:size-11"
              aria-label="More options"
            >
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="min-h-11 text-destructive md:min-h-0"
              onSelect={() => {
                setDeclineError('');
                setDeclineOpen(true);
              }}
            >
              Decline to sign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <output className="sr-only" aria-live="polite">
        {progressLabel(progress)}
      </output>
      <div className="shrink-0 border-b border-border bg-card px-4 py-3 md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={cn(
              'font-semibold',
              progress.complete ? 'text-success-fg' : 'text-foreground',
            )}
          >
            {progressLabel(progress)}
          </p>
          <p className="text-sm text-muted-foreground">
            {progress.done} of {progress.total} done
          </p>
        </div>
        <ProgressBar progress={progress} className="mt-2 w-full" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-auto bg-muted px-4 py-4 md:px-12 md:py-6"
        >
          <Document
            file={file}
            suspense={false}
            loading={
              <p className="py-16 text-center text-sm text-muted-foreground">
                Opening the PDF…
              </p>
            }
            error={
              <p className="py-16 text-center text-sm text-destructive">
                This file could not be read as a PDF.
              </p>
            }
          >
            <div className="flex flex-col items-center gap-4 md:gap-6">
              {view.upload.geometry.map((page, index) => {
                const { viewW, viewH } = viewSize(page);
                const { width, height } = pagePixels(
                  viewW,
                  viewH,
                  zoom,
                  frameWidth,
                );
                return (
                  <div
                    key={pageKey(index)}
                    data-page-index={index}
                    className="on-paper relative shrink-0 border border-border bg-card shadow-sm"
                    style={{ width, height }}
                  >
                    <Page
                      pageNumber={index + 1}
                      width={width}
                      devicePixelRatio={cappedDevicePixelRatio()}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      suspense={false}
                      loading={null}
                      className="absolute top-0 left-0"
                    />
                    <div className="pointer-events-none absolute inset-0 z-10">
                      {prior.map((value) => {
                        const field = view.layout.fields.find(
                          (item) => item.id === value.fieldId,
                        );
                        if (!field || field.pageIndex !== index) return null;
                        return (
                          <div
                            key={value.fieldId}
                            className="absolute text-foreground"
                            style={boxStyle(field)}
                          >
                            <InkGraphic
                              field={field}
                              value={value}
                              viewW={viewW}
                              viewH={viewH}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {view.fields
                      .filter((field) => field.pageIndex === index)
                      .map((field) => (
                        <FieldBox
                          key={field.id}
                          field={field}
                          viewW={viewW}
                          viewH={viewH}
                          scale={width / viewW}
                          color={signerColor(view.you.order)}
                          name={view.you.name}
                          datePreview={view.dateSigned}
                          value={answers.find(
                            (item) => item.fieldId === field.id,
                          )}
                          state={fieldState(field, progress, answers)}
                          touch={touch}
                          onSignature={() => setCaptureId(field.id)}
                          onText={(text) =>
                            setAnswers((current) =>
                              upsert(current, { fieldId: field.id, text }),
                            )
                          }
                          onCheck={(checked) =>
                            setAnswers((current) =>
                              upsert(current, { fieldId: field.id, checked }),
                            )
                          }
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </Document>
        </div>

        <aside className="hidden w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border bg-card p-4 lg:flex">
          <FieldsPanel
            view={view}
            progress={progress}
            answers={answers}
            onJump={(id) => focusField(id, false)}
          />
          <OrderPanel view={view} />
          <p className="mt-auto text-small text-muted-foreground">
            Questions about this document? Contact{' '}
            {view.sender.name || 'the sender'} at {view.sender.email}. You can
            decline from the more options menu.
          </p>
        </aside>
      </div>

      <footer className="flex shrink-0 items-center gap-4 border-t border-border bg-card p-3 md:px-6 md:py-4">
        <p className="hidden flex-1 text-sm text-muted-foreground md:block">
          {progress.left > 0
            ? 'Fill in the highlighted fields, or use Next field to jump to the next one.'
            : "All fields are done. Review and sign when you're ready."}
        </p>
        <Button
          type="button"
          className="h-12 w-full text-base md:w-auto md:min-w-44"
          onClick={primary}
        >
          {label}
        </Button>
      </footer>

      {capturing ? (
        <CaptureSheet
          key={capturing.id}
          title={
            capturing.kind === 'initials'
              ? 'Add your initials'
              : 'Add your signature'
          }
          existing={
            answers.find((item) => item.fieldId === capturing.id)?.signature
          }
          onCancel={() => setCaptureId(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            control(capturing.id)?.focus({ preventScroll: true });
          }}
          onUse={(signature) => {
            setAnswers((current) =>
              upsert(current, { fieldId: capturing.id, signature }),
            );
            setCaptureId(null);
          }}
        />
      ) : null}

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title={view.title}
        signerName={view.you.name}
        nextSignerName={nextName}
        rows={summaryRows(view.fields, answers)}
        consent={consent}
        onConsent={setConsent}
        busy={busy}
        error={error}
        onSign={() => void sign()}
        onDecline={() => {
          setReviewOpen(false);
          setDeclineError('');
          setDeclineOpen(true);
        }}
      />
      <DeclineDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        senderName={view.sender.name}
        busy={busy}
        error={declineError}
        onDecline={(reason) => void decline(reason)}
      />
    </div>
  );
}

function ProgressBar({
  progress,
  className,
}: {
  progress: Progress;
  className?: string;
}) {
  const fill = progress.complete ? 'bg-success' : 'bg-primary';
  const segmented = progress.total > 0 && progress.total <= SEGMENT_LIMIT;
  return (
    <div
      role="img"
      aria-label={progressAlt(progress)}
      className={cn('flex h-1.5 gap-1.5', className)}
    >
      {segmented ? (
        progress.segments.map((done, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and never reorder
            key={index}
            className={cn(
              'h-full flex-1 rounded-full',
              done ? fill : 'bg-border',
            )}
          />
        ))
      ) : (
        <span className="h-full w-full overflow-hidden rounded-full bg-border">
          <span
            className={cn('block h-full rounded-full', fill)}
            style={{
              width: `${progress.total === 0 ? 100 : (progress.done / progress.total) * 100}%`,
            }}
          />
        </span>
      )}
    </div>
  );
}

const STATE_LABEL: Record<FieldState, string> = {
  todo: 'To do',
  next: 'Next',
  done: 'Done',
};

function fieldLabels(fields: readonly FieldInput[]): Map<string, string> {
  const total: Record<string, number> = {};
  const seen: Record<string, number> = {};
  for (const field of fields) total[field.kind] = (total[field.kind] ?? 0) + 1;
  const labels = new Map<string, string>();
  for (const field of fields) {
    seen[field.kind] = (seen[field.kind] ?? 0) + 1;
    labels.set(
      field.id,
      (total[field.kind] ?? 0) > 1
        ? `${FIELD_LABEL[field.kind]} ${seen[field.kind]}`
        : FIELD_LABEL[field.kind],
    );
  }
  return labels;
}

function FieldsPanel({
  view,
  progress,
  answers,
  onJump,
}: {
  view: Ready;
  progress: Progress;
  answers: readonly FieldValue[];
  onJump: (id: string) => void;
}) {
  const required = requiredFields(view.fields);
  const labels = fieldLabels(required);
  return (
    <section aria-labelledby="your-fields">
      <h2
        id="your-fields"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Your fields
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {required.map((field) => {
          const state = fieldState(field, progress, answers);
          return (
            <li key={field.id}>
              <button
                type="button"
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  state === 'next'
                    ? 'border-primary bg-brand-bg'
                    : 'border-border bg-card hover:bg-accent',
                )}
                onClick={() => onJump(field.id)}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border-2',
                    state === 'done'
                      ? 'border-success bg-success text-white'
                      : state === 'next'
                        ? 'border-primary'
                        : 'border-input',
                  )}
                >
                  {state === 'done' ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {labels.get(field.id)}
                </span>
                <span
                  className={cn(
                    'text-small',
                    state === 'next'
                      ? 'font-medium text-brand-fg'
                      : 'text-muted-foreground',
                  )}
                >
                  {STATE_LABEL[state]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OrderPanel({ view }: { view: Ready }) {
  const people = [
    { order: view.you.order, name: view.you.name, you: true },
    ...view.others.map((other) => ({
      order: other.order,
      name: other.name,
      you: false,
    })),
  ].sort((left, right) => left.order - right.order);
  return (
    <section aria-labelledby="signing-order">
      <h2
        id="signing-order"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Signing order
      </h2>
      <ol className="mt-3 flex flex-col gap-3">
        {people.map((person) => {
          const status = person.you
            ? 'Signing now'
            : person.order < view.you.order
              ? 'Signed'
              : 'After you';
          return (
            <li key={person.order} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold text-foreground"
                style={{ borderColor: signerColor(person.order) }}
              >
                {person.order}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-1 font-medium text-foreground">
                <span className="truncate">{person.name}</span>
                {person.you ? (
                  <span className="shrink-0 font-normal text-muted-foreground">
                    (you)
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'text-small',
                  person.you
                    ? 'font-medium text-brand-fg'
                    : 'text-muted-foreground',
                )}
              >
                {status}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A field on the page. Every kind the signer can act on is a real, focusable control. */
function FieldBox({
  field,
  viewW,
  viewH,
  scale,
  color,
  name,
  datePreview,
  value,
  state,
  touch,
  onSignature,
  onText,
  onCheck,
}: {
  field: FieldInput;
  viewW: number;
  viewH: number;
  scale: number;
  color: string;
  name: string;
  datePreview: { text: string; reliable: boolean };
  value: FieldValue | undefined;
  state: FieldState;
  touch: boolean;
  onSignature: () => void;
  onText: (text: string) => void;
  onCheck: (checked: boolean) => void;
}) {
  const filled = state === 'done';
  const heightPx = (field.h / 1_000_000) * viewH * scale;
  const textSize = Math.max(11, Math.min(18, heightPx * 0.42));
  const prompt = (kind: 'sign' | 'type') =>
    `${touch ? 'Tap' : 'Click'} to ${kind}`;
  const style: CSSProperties = {
    borderColor: color,
    borderStyle: !field.required && !filled ? 'dashed' : 'solid',
    borderWidth: filled || !field.required ? 1.5 : 2,
    background: `color-mix(in oklab, ${color} ${filled ? 6 : field.required ? 10 : 5}%, transparent)`,
    boxShadow:
      state === 'next'
        ? '0 0 0 2px var(--card), 0 0 0 4px var(--primary)'
        : undefined,
    fontSize: textSize,
  };
  const hit =
    "relative before:absolute before:top-1/2 before:left-1/2 before:size-full before:min-h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
  const focusRing =
    'outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2';
  const readOnly = field.kind === 'date_signed' || field.kind === 'full_name';

  return (
    <div
      data-field-id={field.id}
      className="absolute z-20"
      style={boxStyle(field)}
    >
      {state === 'next' ? (
        <span
          aria-hidden="true"
          className="absolute -top-7 left-0 inline-flex items-center gap-0.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
        >
          Next
          <ChevronDown className="size-3.5" strokeWidth={2.5} />
        </span>
      ) : null}
      {field.required && !filled && !readOnly ? (
        <Asterisk
          aria-hidden
          className="pointer-events-none absolute top-0.5 right-1 z-10 size-3"
          color={color}
        />
      ) : null}

      {field.kind === 'signature' || field.kind === 'initials' ? (
        <button
          type="button"
          data-control
          aria-label={`${FIELD_LABEL[field.kind]}${field.required ? ', required' : ''}${filled ? ', filled in' : ''}`}
          className={cn(
            hit,
            focusRing,
            'flex h-full w-full cursor-pointer items-center justify-center rounded-sm border text-foreground',
          )}
          style={style}
          onClick={onSignature}
        >
          <span className="absolute inset-0 overflow-hidden">
            {value?.signature ? (
              <InkGraphic
                field={field}
                value={value}
                viewW={viewW}
                viewH={viewH}
              />
            ) : (
              <span className="flex h-full items-center justify-center">
                {prompt('sign')}
              </span>
            )}
          </span>
        </button>
      ) : null}

      {field.kind === 'text' ? (
        <label className={cn(hit, 'block h-full w-full')}>
          <span className="sr-only">
            {FIELD_LABEL.text}
            {field.required ? ', required' : ''}
          </span>
          <input
            data-control
            value={value?.text ?? ''}
            maxLength={limits.textFieldChars}
            placeholder={prompt('type')}
            className={cn(
              focusRing,
              'h-full w-full rounded-sm border bg-transparent px-1 text-center text-foreground placeholder:text-foreground',
            )}
            style={style}
            onChange={(event) => onText(event.target.value)}
          />
        </label>
      ) : null}

      {field.kind === 'checkbox' ? (
        <button
          type="button"
          data-control
          aria-pressed={value?.checked === true}
          aria-label={`${FIELD_LABEL.checkbox}${field.required ? ', required' : ''}`}
          className={cn(
            hit,
            focusRing,
            'flex h-full w-full cursor-pointer items-center justify-center rounded-sm border text-foreground',
          )}
          style={style}
          onClick={() => onCheck(value?.checked !== true)}
        >
          <span className="absolute inset-0">
            {value?.checked ? (
              <InkGraphic
                field={field}
                value={value}
                viewW={viewW}
                viewH={viewH}
              />
            ) : null}
          </span>
        </button>
      ) : null}

      {readOnly ? (
        <p
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-sm bg-muted px-1 text-muted-foreground"
          style={{ fontSize: textSize }}
        >
          <span className="min-w-0 truncate">
            {field.kind === 'full_name'
              ? name || 'Signer'
              : datePreview.reliable
                ? datePreview.text
                : 'Filled in when you sign'}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function boxStyle(field: FieldInput): CSSProperties {
  return {
    left: `${microToPercent(field.x)}%`,
    top: `${microToPercent(field.y)}%`,
    width: `${microToPercent(field.w)}%`,
    height: `${microToPercent(field.h)}%`,
  };
}

function signerColor(order: number): string {
  return `var(--signer-${((order - 1) % 6) + 1})`;
}

function upsert(values: readonly FieldValue[], next: FieldValue): FieldValue[] {
  return [...values.filter((item) => item.fieldId !== next.fieldId), next];
}

function pagePixels(
  viewW: number,
  viewH: number,
  zoom: Zoom,
  frameWidth: number,
): { width: number; height: number } {
  if (!(viewW > 0) || !(viewH > 0)) return { width: 1, height: 1 };
  if (zoom.mode === 'fit') {
    const width = Math.max(1, Math.floor(frameWidth));
    return { width, height: Math.max(1, Math.floor(width * (viewH / viewW))) };
  }
  const factor = CSS_PX_PER_PT * (zoom.percent / 100);
  return {
    width: Math.max(1, Math.floor(viewW * factor)),
    height: Math.max(1, Math.floor(viewH * factor)),
  };
}

function pageKey(index: number): string {
  return `sign-page-${index}`;
}

function cappedDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: 'application/pdf' });
}
