import {
  ChevronDown,
  ChevronUp,
  Minus,
  PanelLeft,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '#/components/ui/button.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx';
import type { Zoom } from '#/features/editor/page-stage.tsx';
import { cn } from '#/lib/utils.ts';

export const ZOOM_PERCENTS = [50, 75, 100, 125, 150, 200] as const;

/** The editor's tool bar (48px): pages, zoom, fit, undo and redo. */
export function EditorToolbar({
  pageNumber,
  pageCount,
  zoom,
  scale,
  locked,
  canUndo,
  canRedo,
  onJump,
  onZoom,
  onUndo,
  onRedo,
  onToggleRail,
  railOpen = false,
}: {
  pageNumber: number;
  pageCount: number;
  zoom: Zoom;
  /** The zoom actually in use, in percent, even while a fit mode is on. */
  scale: number;
  locked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onJump: (page: number) => void;
  onZoom: (zoom: Zoom) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Only on mid-width screens, where the signer rail is a drawer. */
  onToggleRail?: () => void;
  railOpen?: boolean;
}) {
  const [draft, setDraft] = useState(String(pageNumber));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(pageNumber));
  }, [pageNumber, editing]);

  function commit() {
    setEditing(false);
    const wanted = Number.parseInt(draft, 10);
    if (!Number.isFinite(wanted)) {
      setDraft(String(pageNumber));
      return;
    }
    const page = Math.min(pageCount, Math.max(1, wanted));
    setDraft(String(page));
    onJump(page);
  }

  const stepZoom = (direction: 1 | -1) => {
    const current = Math.round(scale);
    const next =
      direction === 1
        ? ZOOM_PERCENTS.find((percent) => percent > current)
        : [...ZOOM_PERCENTS].reverse().find((percent) => percent < current);
    if (next) onZoom({ mode: 'percent', percent: next });
  };

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 md:px-4">
      <div className="flex items-center gap-1">
        {onToggleRail ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Signers and fields"
            aria-expanded={railOpen}
            aria-pressed={railOpen}
            className={
              railOpen
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : undefined
            }
            onClick={onToggleRail}
          >
            <PanelLeft strokeWidth={1.75} />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous page"
          disabled={pageNumber <= 1}
          onClick={() => onJump(pageNumber - 1)}
        >
          <ChevronUp strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next page"
          disabled={pageNumber >= pageCount}
          onClick={() => onJump(pageNumber + 1)}
        >
          <ChevronDown strokeWidth={1.75} />
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Page
          <input
            inputMode="numeric"
            aria-label="Page number"
            value={draft}
            className="h-8 w-12 rounded-md border border-input bg-card px-2 text-center text-sm text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onFocus={(event) => {
              setEditing(true);
              event.currentTarget.select();
            }}
            onChange={(event) =>
              setDraft(event.target.value.replace(/[^0-9]/g, ''))
            }
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setDraft(String(pageNumber));
                setEditing(false);
                event.currentTarget.blur();
              }
            }}
          />
          of {pageCount}
        </label>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          disabled={scale <= ZOOM_PERCENTS[0]}
          onClick={() => stepZoom(-1)}
        >
          <Minus strokeWidth={1.75} />
        </Button>
        <Select
          value={zoom.mode === 'percent' ? String(zoom.percent) : ''}
          onValueChange={(value) =>
            onZoom({ mode: 'percent', percent: Number(value) })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Zoom"
            className="w-24 border-transparent bg-transparent shadow-none"
          >
            <SelectValue placeholder={`${Math.round(scale)}%`} />
          </SelectTrigger>
          <SelectContent position="popper">
            {ZOOM_PERCENTS.map((percent) => (
              <SelectItem key={percent} value={String(percent)}>
                {percent}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          disabled={scale >= ZOOM_PERCENTS[ZOOM_PERCENTS.length - 1]}
          onClick={() => stepZoom(1)}
        >
          <Plus strokeWidth={1.75} />
        </Button>
        <fieldset
          aria-label="Fit"
          className="m-0 ml-2 hidden min-w-0 overflow-hidden rounded-md border border-input p-0 sm:flex"
        >
          {(
            [
              ['fit-width', 'Fit width'],
              ['fit-page', 'Fit page'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={zoom.mode === mode}
              className={cn(
                'h-8 px-3 text-sm font-medium outline-none first:border-r first:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50',
                zoom.mode === mode
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-foreground hover:bg-accent',
              )}
              onClick={() => onZoom({ mode })}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={locked || !canUndo}
          onClick={onUndo}
        >
          <Undo2 strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={locked || !canRedo}
          onClick={onRedo}
        >
          <Redo2 strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
