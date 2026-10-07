import { Check, MoreHorizontal, TriangleAlert, X } from 'lucide-react';

import { Stepper } from '#/components/stepper.tsx';
import { Button } from '#/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx';
import { TitleField } from '#/features/editor/title-field.tsx';

export type SaveState = 'saving' | 'saved' | 'error' | '';

/** The editor's top bar (56px): close, file and save status, steps, problems, menu, send. */
export function EditorHeader({
  fileName,
  saveText,
  saveState,
  problems,
  issues,
  onShowIssues,
  sent,
  sending,
  onClose,
  onReplace,
  onSend,
  onRename,
}: {
  fileName: string;
  /** Saves a new name. Returns an error message, or null when it worked. */
  onRename: (title: string) => Promise<string | null>;
  /** The existing copy: "Saving draft…", "Draft saved", "Draft not saved", or empty. */
  saveText: string;
  saveState: SaveState;
  problems: number;
  /** What needs fixing, shown on hover and on keyboard focus of the chip. */
  issues: readonly string[];
  /** Clicking the chip opens the review dialog, which lists the same things. */
  onShowIssues: () => void;
  sent: boolean;
  sending: boolean;
  onClose: () => void;
  onReplace: () => void;
  onSend: () => void;
}) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X strokeWidth={1.75} />
        </Button>
        <div className="min-w-0">
          <TitleField
            value={fileName}
            disabled={sent || sending}
            onRename={onRename}
            className="max-w-[24ch] sm:max-w-[32ch]"
          />
          {saveText ? (
            <p
              className={
                saveState === 'error'
                  ? 'flex items-center gap-1 text-xs text-destructive'
                  : 'flex items-center gap-1 text-xs text-muted-foreground'
              }
            >
              {saveState === 'saved' ? (
                <Check
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
              ) : null}
              {saveText}
            </p>
          ) : null}
        </div>
      </div>
      <Stepper compact current={1} className="hidden lg:flex" />
      <div className="flex items-center justify-end gap-2">
        {problems > 0 ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="hidden h-7 cursor-pointer items-center gap-1.5 rounded-full bg-warning-bg px-3 text-xs font-medium whitespace-nowrap text-warning-fg outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:inline-flex"
                  onClick={onShowIssues}
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-3.5"
                    strokeWidth={1.75}
                  />
                  {problems} to fix
                </button>
              </TooltipTrigger>
              <TooltipContent
                align="end"
                sideOffset={8}
                className="max-w-72 px-3 py-2 text-left text-small text-balance"
              >
                <p className="font-medium">To send this document:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
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
        <Button
          type="button"
          size="lg"
          disabled={sent || sending}
          onClick={onSend}
        >
          {sending ? 'Sending…' : 'Review and send'}
        </Button>
      </div>
    </header>
  );
}
