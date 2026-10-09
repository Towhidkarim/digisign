import { getDocument } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog.tsx';
import '#/pdf/setup.ts';

/** The widest a page is drawn on screen, in CSS pixels. Larger screens get sharper canvases. */
const MAX_PAGE_WIDTH = 880;

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; pages: number }
  | { kind: 'failed' };

/**
 * Shows a preview PDF on the page itself, one canvas per page. A separate tab would load the
 * PDF as a top-level page, which the app's content security policy can block.
 */
export function PdfPreviewDialog({
  bytes,
  description,
  onClose,
}: {
  bytes: Uint8Array;
  description: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        sheet
        className="flex h-[92dvh] max-w-none flex-col gap-0 overflow-hidden p-0 md:h-[88dvh] md:max-w-[min(960px,calc(100vw-2rem))]"
      >
        <header className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="text-subheading font-semibold">
            Preview
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-small text-muted-foreground">
            {description}
          </DialogDescription>
        </header>
        <PdfPages bytes={bytes} />
      </DialogContent>
    </Dialog>
  );
}

function PdfPages({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    const task = getDocument({
      data: bytes.slice(),
      disableRange: true,
      disableStream: true,
    });
    setStatus({ kind: 'loading' });
    void (async () => {
      try {
        const pdf = await task.promise;
        // Draw at the screen's real pixel density, so text stays sharp on high-DPI displays.
        const density = window.devicePixelRatio || 1;
        const cssWidth = Math.min(
          node.clientWidth || MAX_PAGE_WIDTH,
          MAX_PAGE_WIDTH,
        );
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(number);
          const natural = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: (cssWidth / natural.width) * density,
          });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${(canvas.height / density).toFixed(2)}px`;
          canvas.className =
            'block max-w-full rounded-sm bg-white shadow-md ring-1 ring-border';
          const context = canvas.getContext('2d');
          if (!context) throw new Error('No canvas context');
          await page.render({ canvasContext: context, canvas, viewport })
            .promise;
          if (cancelled) return;
          const figure = document.createElement('figure');
          figure.className = 'mx-auto flex w-fit flex-col items-center gap-2';
          const caption = document.createElement('figcaption');
          caption.className = 'text-xs text-muted-foreground';
          caption.textContent = `Page ${number} of ${pdf.numPages}`;
          figure.append(canvas, caption);
          node.appendChild(figure);
        }
        if (!cancelled) setStatus({ kind: 'ready', pages: pdf.numPages });
      } catch {
        if (!cancelled) setStatus({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
      node.replaceChildren();
      void task.destroy();
    };
  }, [bytes]);

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto bg-muted px-4 py-6 sm:px-6">
      {status.kind === 'loading' ? (
        <output className="block py-16 text-center text-sm text-muted-foreground">
          Loading preview…
        </output>
      ) : null}
      {status.kind === 'failed' ? (
        <p role="alert" className="py-16 text-center text-sm text-destructive">
          This preview could not be shown. Close it and try again.
        </p>
      ) : null}
      <section
        ref={host}
        aria-label="Preview pages"
        className="flex flex-col gap-8"
      />
    </div>
  );
}
