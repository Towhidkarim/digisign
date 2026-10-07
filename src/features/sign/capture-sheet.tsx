import { RadioGroup } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';

import { Button } from '#/components/ui/button.tsx';
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog.tsx';
import { Input } from '#/components/ui/input.tsx';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '#/components/ui/tabs.tsx';
import {
  type SignatureInput,
  signatureInputSchema,
} from '#/core/contracts/index.ts';
import { limits } from '#/core/limits.ts';
import {
  drawnSignature,
  pointsToStrokes,
  type ScriptFont,
  strokesToCanvasPoints,
  typedSignature,
  unpackStrokes,
} from '#/features/sign/capture.ts';
import { FittedScript } from '#/features/sign/fitted-script.tsx';
import { SignatureImage } from '#/features/sign/ink-graphic.tsx';
import {
  forgetSignature,
  loadSavedSignature,
  rememberSignature,
} from '#/features/sign/saved-signature.ts';
import { useMediaQuery } from '#/hooks/use-media-query.ts';
import { cn } from '#/lib/utils.ts';
import { installScriptFaces, SCRIPT_FACE } from '#/pdf/fonts.ts';

type Mode = 'drawn' | 'typed' | 'saved';

/** The pen follows the pad's text colour, which stays dark ink on white paper in either theme. */
function ink(frame: HTMLElement): string {
  return getComputedStyle(frame).color;
}

const TOO_BIG =
  'That drawing is too long or too detailed. Clear it and draw a shorter one.';

export function CaptureSheet({
  title = 'Add your signature',
  existing,
  onCancel,
  onUse,
  onCloseAutoFocus,
}: {
  title?: string;
  existing?: SignatureInput;
  onCancel: () => void;
  onUse: (signature: SignatureInput) => void;
  /** Lets the page put focus back on the exact field that opened the sheet. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [saved] = useState<SignatureInput | null>(() => loadSavedSignature());
  const [mode, setMode] = useState<Mode>(
    existing?.kind === 'typed' ? 'typed' : 'drawn',
  );
  const [typed, setTyped] = useState(
    existing?.kind === 'typed' ? existing.text : '',
  );
  const [font, setFont] = useState<ScriptFont>(
    existing?.kind === 'typed' ? existing.font : 'script-1',
  );
  const [drawn, setDrawn] = useState<string | null>(
    existing?.kind === 'drawn' ? existing.strokes : null,
  );
  const [savedGone, setSavedGone] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [fontsReady, setFontsReady] = useState(false);
  const hasSaved = saved !== null && !savedGone;

  useEffect(() => {
    let cancelled = false;
    void installScriptFaces().then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const valid =
    mode === 'drawn'
      ? drawn !== null
      : mode === 'typed'
        ? typed.trim().length > 0
        : hasSaved;

  function candidate(): SignatureInput | null {
    if (mode === 'drawn') {
      return drawn
        ? {
            kind: 'drawn',
            box: { w: 9000, h: 3000 },
            strokes: drawn,
          }
        : null;
    }
    if (mode === 'typed') {
      return typed.trim() ? typedSignature(typed, font) : null;
    }
    return hasSaved ? saved : null;
  }

  function accept() {
    const signature = candidate();
    if (!signature) {
      setError(
        mode === 'drawn'
          ? 'Draw a signature first.'
          : mode === 'typed'
            ? 'Type your name first.'
            : 'There is no saved signature.',
      );
      return;
    }
    const checked = signatureInputSchema.safeParse(signature);
    if (!checked.success) {
      setError(
        mode === 'drawn' ? TOO_BIG : 'That signature could not be used.',
      );
      return;
    }
    if (remember && mode !== 'saved') rememberSignature(checked.data);
    onUse(checked.data);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        sheet
        aria-describedby={undefined}
        className="gap-4 p-4 sm:p-6 md:max-w-xl"
        onCloseAutoFocus={onCloseAutoFocus}
        closeLabel="Close"
      >
        <div
          aria-hidden="true"
          className="mx-auto -mt-1 h-1 w-10 rounded-full bg-border md:hidden"
        />
        <DialogTitle>{title}</DialogTitle>
        <Tabs
          value={mode}
          onValueChange={(next) => {
            setMode(next as Mode);
            setError('');
          }}
        >
          <TabsList
            aria-label="How to add it"
            className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1"
          >
            {(
              [
                ['drawn', 'Draw'],
                ['typed', 'Type'],
                ...(hasSaved ? [['saved', 'Saved']] : []),
              ] as [Mode, string][]
            ).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-11 justify-center data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="drawn" className="mt-3">
            <DrawPad
              seed={drawn}
              onInk={(packed) => {
                setDrawn(packed);
                setError('');
              }}
              onError={setError}
            />
          </TabsContent>
          <TabsContent value="typed" className="mt-3">
            <TypePad
              typed={typed}
              font={font}
              fontsReady={fontsReady}
              onTyped={(value) => {
                setTyped(value);
                setError('');
              }}
              onFont={setFont}
            />
          </TabsContent>
          {saved ? (
            <TabsContent value="saved" className="mt-3">
              <div className="flex flex-col gap-3">
                <div className="on-paper flex aspect-3/1 w-full items-center justify-center rounded-lg border border-input bg-card p-3 text-foreground">
                  <SignatureImage signature={saved} className="h-full w-full" />
                </div>
                <button
                  type="button"
                  className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground max-sm:min-h-11"
                  onClick={() => {
                    forgetSignature();
                    setSavedGone(true);
                    setMode('drawn');
                  }}
                >
                  Forget saved signature
                </button>
              </div>
            </TabsContent>
          ) : null}
        </Tabs>

        {mode !== 'saved' ? (
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-primary"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>
              Remember on this device
              <span className="block text-small text-muted-foreground">
                Kept only in this browser. You can remove it any time.
              </span>
            </span>
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          className="h-12 w-full text-base"
          aria-disabled={!valid}
          onClick={accept}
        >
          Use this signature
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function TypePad({
  typed,
  font,
  fontsReady,
  onTyped,
  onFont,
}: {
  typed: string;
  font: ScriptFont;
  fontsReady: boolean;
  onTyped: (value: string) => void;
  onFont: (font: ScriptFont) => void;
}) {
  const name = typed.trim();
  return (
    <div className="flex flex-col gap-3">
      <Input
        value={typed}
        maxLength={limits.typedSignatureChars}
        placeholder="Type your name"
        aria-label="Type your name"
        autoComplete="off"
        className="h-12 text-base"
        onChange={(event) => onTyped(event.target.value)}
      />
      <div
        className="on-paper relative aspect-3/1 w-full rounded-lg border border-input bg-card text-foreground"
        aria-live="polite"
      >
        <FittedScript
          text={name || 'Your signature'}
          family={fontsReady ? SCRIPT_FACE[font].family : 'var(--font-sans)'}
          className={cn(
            'absolute inset-0 px-4 py-3',
            name ? 'text-foreground' : 'text-muted-foreground',
          )}
        />
      </div>
      <RadioGroup.Root
        value={font}
        onValueChange={(next) => onFont(next as ScriptFont)}
        aria-label="Signature font"
        className="grid grid-cols-2 gap-2"
      >
        {(Object.keys(SCRIPT_FACE) as ScriptFont[]).map((key) => (
          <RadioGroup.Item
            key={key}
            value={key}
            aria-label={SCRIPT_FACE[key].label}
            className="on-paper relative h-14 overflow-hidden rounded-lg border border-input bg-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-2 data-[state=checked]:border-primary data-[state=checked]:bg-brand-bg"
          >
            <FittedScript
              text={name || SCRIPT_FACE[key].label}
              family={fontsReady ? SCRIPT_FACE[key].family : 'var(--font-sans)'}
              className="absolute inset-0 px-3 py-2 text-foreground"
            />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

function DrawPad({
  seed,
  onInk,
  onError,
}: {
  seed: string | null;
  onInk: (packed: string | null) => void;
  onError: (message: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const initial = useRef(seed);
  const onInkRef = useRef(onInk);
  onInkRef.current = onInk;
  const touch = useMediaQuery('(pointer: coarse)');
  const [strokeCount, setStrokeCount] = useState(0);

  const report = useCallback(() => {
    const pad = padRef.current;
    const frame = frameRef.current;
    if (!pad || !frame || pad.isEmpty()) {
      setStrokeCount(0);
      onInkRef.current(null);
      return;
    }
    const width = frame.clientWidth;
    const height = Math.max(1, Math.round(width / 3));
    setStrokeCount(pad.toData().length);
    try {
      onInkRef.current(
        drawnSignature(pointsToStrokes(pad.toData(), width, height)).strokes,
      );
    } catch (caught) {
      onInkRef.current(null);
      onError(
        caught instanceof Error
          ? caught.message
          : 'That drawing could not be kept.',
      );
    }
  }, [onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const pad = new SignaturePad(canvas, {
      penColor: ink(frame),
      minWidth: 0.8,
      maxWidth: 2.4,
    });
    padRef.current = pad;
    const redraw = () => {
      const width = frame.clientWidth;
      const height = Math.max(1, Math.round(width / 3));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
      const keep = pad.toData();
      pad.clear();
      const groups = keep.length
        ? keep
        : initial.current
          ? strokesToCanvasPoints(
              unpackStrokes(initial.current),
              width,
              height,
            ).map((points) => ({
              penColor: ink(frame),
              dotSize: 0,
              minWidth: 0.8,
              maxWidth: 2.4,
              velocityFilterWeight: 0.7,
              compositeOperation: 'source-over' as const,
              points,
            }))
          : [];
      initial.current = null;
      if (groups.length) pad.fromData(groups);
    };
    redraw();
    setStrokeCount(pad.toData().length);
    const observer = new ResizeObserver(redraw);
    observer.observe(frame);
    pad.addEventListener('endStroke', report);
    return () => {
      observer.disconnect();
      pad.off();
    };
  }, [report]);

  function clear() {
    padRef.current?.clear();
    report();
  }

  function undo() {
    const pad = padRef.current;
    if (!pad) return;
    const strokes = pad.toData();
    strokes.pop();
    pad.fromData(strokes);
    report();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        className="on-paper relative overflow-hidden rounded-lg border border-input bg-card text-foreground"
      >
        <canvas
          ref={canvasRef}
          aria-label="Draw a signature"
          className="block w-full touch-none"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 bottom-[22%] border-t border-dashed border-input"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[22%] left-4 -translate-y-1 text-small text-muted-foreground"
        >
          ×
        </span>
      </div>
      {touch ? (
        <p className="text-small text-muted-foreground">
          Use your finger or a stylus. Turn your phone sideways for more room.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={strokeCount === 0}
          onClick={clear}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={strokeCount === 0}
          onClick={undo}
        >
          Undo
        </Button>
      </div>
    </div>
  );
}
