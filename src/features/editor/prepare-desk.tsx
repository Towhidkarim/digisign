import { useNavigate, useSearch } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '#/components/ui/sheet.tsx';
import { type FieldKind, limits } from '#/core/limits.ts';
import { checkSigners } from '#/core/signer-rules.ts';
import { ulid } from '#/core/ulid.ts';
import { displayTitle } from '#/features/dashboard/format.ts';
import { DeskDrag } from '#/features/editor/desk-drag.tsx';
import {
  type Draft,
  discardPrepareDraft,
  getDraft,
  hydrateDraft,
  initUpload,
  loadServerDraft,
  publishDocument,
  renameDocument,
  resumeServerDraft,
  saveLayout,
  savePreparation,
  saveSigners,
} from '#/features/editor/draft.ts';
import {
  EditorHeader,
  type SaveState,
} from '#/features/editor/editor-header.tsx';
import { EditorToolbar } from '#/features/editor/editor-toolbar.tsx';
import {
  MobileHeader,
  MobileReview,
} from '#/features/editor/mobile-review.tsx';
import { PageStage, type Zoom } from '#/features/editor/page-stage.tsx';
import {
  createEditorState,
  editorReducer,
  SIGNER_COLORS,
  toSaveLayout,
} from '#/features/editor/reducer.ts';
import { ReviewDialog } from '#/features/editor/review-dialog.tsx';
import { SignerRail } from '#/features/editor/signer-rail.tsx';
import { countProblems, problemList } from '#/features/editor/summary.ts';
import {
  type ReadingStep,
  UploadStage,
} from '#/features/editor/upload-stage.tsx';
import { useMediaQuery } from '#/hooks/use-media-query.ts';
import { PdfLoadError, pdfMessages } from '#/pdf/load.ts';

export function PrepareDesk() {
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const requestedId = useSearch({
    from: '/prepare',
    select: (search) => search.documentId,
  });
  const [over, setOver] = useState(false);
  const [session, setSession] = useState<Draft>({
    fileName: '',
    bytes: null,
    upload: null,
    signers: [],
    layout: null,
  });
  const [resume, setResume] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<'idle' | 'reading' | 'opening'>('idle');
  const [error, setError] = useState('');
  const [step, setStep] = useState<ReadingStep>('checking');
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    if (requestedId) {
      setPhase('opening');
      void resumeServerDraft(requestedId).then((result) => {
        if (cancelled) return;
        setPhase('idle');
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setSession({ ...result, bytes: result.bytes });
      });
      return () => {
        cancelled = true;
      };
    }
    const stored = hydrateDraft();
    const storedId = stored.upload?.documentId;
    if (!storedId) return;
    void loadServerDraft(storedId).then((result) => {
      if (cancelled) return;
      const currentId = getDraft().upload?.documentId;
      if (currentId && currentId !== storedId) return;
      if ('error' in result || result.status !== 'draft') {
        discardPrepareDraft();
        return;
      }
      if (stored.bytes) setResume({ ...stored, bytes: stored.bytes });
      else setSession({ ...stored });
    });
    return () => {
      cancelled = true;
    };
  }, [requestedId]);

  function takeFile(file: File | undefined) {
    if (!file || phase !== 'idle') return;
    const pdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!pdf) {
      setError('Choose a PDF.');
      return;
    }
    void openFile(file);
  }

  async function openFile(file: File) {
    setError('');
    setPicked({ name: file.name, size: file.size });
    setStep('checking');
    setPhase('reading');
    try {
      if (file.size > limits.pdfSizeBytes) {
        throw new PdfLoadError(pdfMessages.tooBig);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await initUpload({ name: file.name, bytes }, setStep);
      setSession({ ...getDraft() });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : pdfMessages.unreadable,
      );
    } finally {
      setPhase('idle');
    }
  }

  const ready = session.upload !== null && session.bytes !== null;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <input
        id="prepare-pdf"
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={phase !== 'idle'}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          takeFile(file);
        }}
      />
      {ready && session.upload && session.bytes ? (
        <Editor
          key={session.upload.documentId}
          fileName={session.fileName}
          bytes={session.bytes}
          upload={session.upload}
          signers={session.signers}
          layout={session.layout}
          onReplace={() => fileRef.current?.click()}
          viewError={error}
        />
      ) : (
        <UploadStage
          inputId="prepare-pdf"
          fileRef={fileRef}
          phase={phase}
          step={step}
          picked={picked}
          over={over}
          error={error}
          needsFile={session.upload !== null && !session.bytes}
          resume={
            resume?.upload && resume.bytes && !requestedId
              ? { title: displayTitle(resume.fileName) || 'Draft' }
              : null
          }
          onResume={() => {
            if (resume) setSession({ ...resume, bytes: resume.bytes });
          }}
          dragHandlers={{
            onDragEnter: (event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setOver(true);
            },
            onDragOver: (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            },
            onDragLeave: () => {
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) {
                dragDepth.current = 0;
                setOver(false);
              }
            },
            onDrop: (event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setOver(false);
              takeFile(event.dataTransfer.files[0]);
            },
          }}
        />
      )}
    </div>
  );
}

function Editor({
  fileName: savedFileName,
  bytes,
  upload,
  signers,
  layout,
  onReplace,
  viewError,
}: {
  fileName: string;
  bytes: Uint8Array;
  upload: NonNullable<Draft['upload']>;
  signers: Draft['signers'];
  layout: Draft['layout'];
  onReplace: () => void;
  viewError: string;
}) {
  const [state, dispatch] = useReducer(
    editorReducer,
    { upload, signers, layout },
    (init) =>
      createEditorState({
        documentId: init.upload.documentId,
        geometry: init.upload.geometry,
        signers: init.signers,
        fields:
          init.layout?.documentId === init.upload.documentId
            ? init.layout.fields
            : [],
        layoutVersion:
          init.layout?.documentId === init.upload.documentId
            ? init.layout.layoutVersion
            : 0,
      }),
  );
  const navigate = useNavigate();
  const [fileName, setFileName] = useState(savedFileName);
  const rename = useCallback(
    async (title: string): Promise<string | null> => {
      const result = await renameDocument(upload.documentId, title);
      if ('error' in result) return result.error;
      setFileName(result.title);
      return null;
    },
    [upload.documentId],
  );
  const [sent, setSent] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Phone: a review screen with no stage. Tablet: the stage plus a signer drawer. Desktop: both.
  const phone = useMediaQuery('(max-width: 767px)');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [railOpen, setRailOpen] = useState(false);
  const [revealErrors, setRevealErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('');
  const [invited, setInvited] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  const [zoom, setZoom] = useState<Zoom>({ mode: 'fit-width' });
  const [scale, setScale] = useState(100);
  const [jump, setJump] = useState<{ page: number; nonce: number } | null>(
    null,
  );
  const [pageNumber, setPageNumber] = useState(1);
  const [drawnError, setDrawnError] = useState('');
  const [notice, setNotice] = useState('');
  const file = useMemo(
    () => new Blob([bytes.slice()], { type: 'application/pdf' }),
    [bytes],
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const versionRef = useRef(state.layoutVersion);
  const saveChain = useRef(Promise.resolve());
  const sendingRef = useRef(false);
  const lockedRef = useRef(false);

  const enqueueSave = useCallback(
    (snapshot: {
      documentId: string;
      signers: typeof state.signers;
      fields: typeof state.fields;
    }) => {
      const noteVersion = (layoutVersion: number) => {
        versionRef.current = layoutVersion;
        if (layoutVersion !== stateRef.current.layoutVersion) {
          dispatch({ type: 'sync-version', layoutVersion });
        }
      };
      const run = saveChain.current.then(async () => {
        const saved = await savePreparation({
          documentId: snapshot.documentId,
          layoutVersion: versionRef.current,
          signers: snapshot.signers,
          fields: snapshot.fields,
        });
        if (!('error' in saved)) {
          noteVersion(saved.layoutVersion);
          return saved;
        }
        if (!saved.error.includes('updated')) return saved;
        const fresh = await loadServerDraft(snapshot.documentId);
        if ('error' in fresh) return saved;
        const retry = await savePreparation({
          documentId: snapshot.documentId,
          layoutVersion: fresh.layoutVersion,
          signers: snapshot.signers,
          fields: snapshot.fields,
        });
        if (!('error' in retry)) noteVersion(retry.layoutVersion);
        return retry;
      });
      saveChain.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [],
  );

  useEffect(() => {
    if (lockedRef.current) return;
    const snapshot = {
      documentId: state.documentId,
      signers: state.signers,
      fields: state.fields,
    };
    let cancelled = false;
    setSaveState('saving');
    const id = window.setTimeout(() => {
      if (cancelled || sendingRef.current || lockedRef.current) return;
      void enqueueSave(snapshot).then((result) => {
        if (cancelled || sendingRef.current || lockedRef.current) return;
        if ('error' in result) {
          if (result.error.includes('no longer be edited')) {
            lockedRef.current = true;
            setSent(true);
            setReviewOpen(false);
            setSentOpen(true);
            setSaveState('saved');
            return;
          }
          setSaveState('error');
          setNotice(result.error);
          return;
        }
        setSaveState('saved');
        setNotice('');
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [enqueueSave, state.documentId, state.fields, state.signers]);

  useEffect(() => {
    function flush() {
      if (lockedRef.current || sendingRef.current) return;
      const current = stateRef.current;
      saveSigners(current.signers);
      saveLayout(toSaveLayout(current));
      void enqueueSave({
        documentId: current.documentId,
        signers: current.signers,
        fields: current.fields,
      });
    }
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [enqueueSave]);

  const nextName = invited[0]?.name.trim() ?? '';

  async function leave() {
    if (!lockedRef.current) {
      const current = stateRef.current;
      setSaveState('saving');
      const saved = await enqueueSave({
        documentId: current.documentId,
        signers: current.signers,
        fields: current.fields,
      });
      if ('error' in saved && !saved.error.includes('no longer be edited')) {
        setSaveState('error');
        setNotice(saved.error);
        return;
      }
    }
    await navigate({
      to: '/documents/$documentId',
      params: { documentId: stateRef.current.documentId },
    });
  }

  /** Click or keyboard add. The same "place" action a drop uses, on the page in view. */
  function addField(kind: FieldKind) {
    if (lockedRef.current || sent) return;
    const current = stateRef.current;
    if (!current.selectedSignerId) return;
    if (current.fields.length >= limits.fieldsPerDocument) {
      toast(
        'This document has reached its limit of ' +
          limits.fieldsPerDocument +
          ' fields.',
      );
      return;
    }
    const pageIndex = Math.min(Math.max(pageNumber, 1), upload.pageCount) - 1;
    const onPage = current.fields.filter(
      (field) => field.pageIndex === pageIndex,
    ).length;
    if (onPage >= limits.fieldsPerPage) {
      toast(
        'Page ' +
          (pageIndex + 1) +
          ' has reached its limit of ' +
          limits.fieldsPerPage +
          ' fields.',
      );
      return;
    }
    // Centre of the page, nudged for each field already there so new ones do not stack.
    const nudge = (onPage % 8) * 20_000;
    dispatch({
      type: 'place',
      id: ulid(),
      kind,
      pageIndex,
      x: 500_000 + nudge,
      y: 500_000 + nudge,
    });
  }

  async function send() {
    if (lockedRef.current || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setNotice('');
    const current = stateRef.current;
    saveSigners(current.signers);
    saveLayout(toSaveLayout(current));
    const saved = await enqueueSave({
      documentId: current.documentId,
      signers: current.signers,
      fields: current.fields,
    });
    if ('error' in saved) {
      sendingRef.current = false;
      setSending(false);
      setSaveState('error');
      setNotice(saved.error);
      setReviewOpen(false);
      return;
    }
    const published = await publishDocument(current.documentId);
    if ('error' in published) {
      sendingRef.current = false;
      setSending(false);
      setNotice(published.error);
      setReviewOpen(false);
      return;
    }
    lockedRef.current = true;
    setSent(true);
    setReviewOpen(false);
    setSentOpen(true);
    setSaveState('saved');
    setSending(false);
    sendingRef.current = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const fresh = await loadServerDraft(current.documentId);
      if (!('error' in fresh)) {
        const waiting = fresh.signers.filter(
          (signer) => signer.status === 'invited',
        );
        if (waiting.length > 0) {
          setInvited(
            waiting.map((signer) => ({
              id: signer.id,
              name: signer.name,
              email: signer.email,
            })),
          );
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  const rail = (
    <SignerRail
      signers={state.signers}
      selectedSignerId={state.selectedSignerId}
      fields={state.fields}
      dispatch={dispatch}
      onAddField={addField}
      revealErrors={revealErrors}
    />
  );
  const desk = desktop ? rail : null;

  return (
    <>
      {phone ? (
        <MobileHeader
          fileName={fileName}
          onRename={rename}
          saveText={
            sent
              ? ''
              : saveState === 'saving'
                ? 'Saving draft…'
                : saveState === 'saved'
                  ? 'Draft saved'
                  : saveState === 'error'
                    ? 'Draft not saved'
                    : ''
          }
          saveError={saveState === 'error'}
          sending={sending}
          onClose={() => void leave()}
          onReplace={onReplace}
        />
      ) : (
        <>
          <EditorHeader
            fileName={fileName}
            onRename={rename}
            saveText={
              sent
                ? ''
                : saveState === 'saving'
                  ? 'Saving draft…'
                  : saveState === 'saved'
                    ? 'Draft saved'
                    : saveState === 'error'
                      ? 'Draft not saved'
                      : ''
            }
            saveState={saveState}
            problems={countProblems(state.signers, state.fields)}
            issues={problemList(state.signers, state.fields)}
            onShowIssues={() => {
              setRevealErrors(true);
              setReviewOpen(true);
            }}
            sent={sent}
            sending={sending}
            onClose={() => void leave()}
            onReplace={onReplace}
            onSend={() => {
              setRevealErrors(true);
              setReviewOpen(true);
            }}
          />
          <EditorToolbar
            pageNumber={pageNumber}
            pageCount={upload.pageCount}
            zoom={zoom}
            scale={scale}
            locked={sent}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onJump={(page) =>
              setJump((current) => ({ page, nonce: (current?.nonce ?? 0) + 1 }))
            }
            onZoom={setZoom}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            onToggleRail={
              desktop ? undefined : () => setRailOpen((open) => !open)
            }
            railOpen={railOpen}
          />
        </>
      )}
      {viewError || drawnError ? (
        <p
          className="border-b border-border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {viewError || drawnError}
        </p>
      ) : null}
      {notice ? (
        <p
          className="border-b border-border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      {sent ? (
        <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
          This document can no longer be edited.{' '}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => void leave()}
          >
            Open it
          </button>
        </p>
      ) : null}
      {phone ? (
        <MobileReview
          file={file}
          fileName={fileName}
          pageCount={upload.pageCount}
          signers={state.signers}
          fields={state.fields}
          checks={checkSigners(state.signers, state.fields)}
          revealErrors={revealErrors}
          locked={sent}
          sending={sending}
          dispatch={dispatch}
          onReview={() => {
            setRevealErrors(true);
            setReviewOpen(true);
          }}
        />
      ) : (
        <DeskDrag
          signers={state.signers}
          fieldColor={
            state.signers.find((signer) => signer.id === state.selectedSignerId)
              ?.color ?? SIGNER_COLORS[0]
          }
          dispatch={dispatch}
        >
          <div
            className="flex min-h-0 flex-1 flex-row"
            inert={sent ? true : undefined}
          >
            {desk}
            <div className="flex min-h-0 min-w-0 flex-1">
              <Suspense
                fallback={
                  <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Opening the PDF…
                  </p>
                }
              >
                <PageStage
                  file={file}
                  state={state}
                  zoom={zoom}
                  dispatch={dispatch}
                  onPageChange={setPageNumber}
                  onViewError={setDrawnError}
                  jumpTo={jump}
                  onScale={setScale}
                />
              </Suspense>
            </div>
          </div>
          {desktop ? null : (
            <Sheet open={railOpen} onOpenChange={setRailOpen} modal={false}>
              <SheetContent
                side="left"
                showCloseButton={false}
                aria-describedby={undefined}
                className="w-80 max-w-none gap-0 p-0"
                style={{ top: '6.5rem', bottom: 0, height: 'auto' }}
                onInteractOutside={(event) => event.preventDefault()}
              >
                <SheetTitle className="sr-only">Signers and fields</SheetTitle>
                <SheetDescription className="sr-only">
                  Add signers and drag fields onto the page.
                </SheetDescription>
                {rail}
              </SheetContent>
            </Sheet>
          )}
        </DeskDrag>
      )}
      <ReviewDialog
        open={reviewOpen && !sent}
        onOpenChange={setReviewOpen}
        fileName={fileName}
        pageCount={upload.pageCount}
        fieldCount={state.fields.length}
        signers={state.signers}
        checks={checkSigners(state.signers, state.fields)}
        sending={sending}
        onSend={() => void send()}
      />
      <AlertDialog open={sentOpen} onOpenChange={setSentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <span
              aria-hidden="true"
              className="mx-auto mb-1 grid size-14 place-items-center rounded-full bg-success-bg text-success-fg"
            >
              <Send className="size-6" strokeWidth={1.75} />
            </span>
            <AlertDialogTitle>Sent for signature</AlertDialogTitle>
            <AlertDialogDescription>
              {nextName
                ? `${nextName} is next. This document can no longer be edited. Open it to copy their signing link.`
                : 'This document can no longer be edited. The next person is invited in order. Open it to copy their signing link.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={() => void leave()}>
              Open this document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
