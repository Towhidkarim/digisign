import { Check, FileText, LoaderCircle } from 'lucide-react';

import { cn } from '#/lib/utils.ts';

/** The real order of the check. Each phase is the step now running. */
export type Phase = 'record' | 'file' | 'compare';

const STEPS = [
  { text: 'Found the signed record', phase: 'record' },
  { text: "Checked the record's signature and history", phase: 'record' },
  { text: 'Reading your file', phase: 'file' },
  { text: 'Comparing it with the original', phase: 'compare' },
] as const;

/** Index of the item now running. Items before it are done, items after it are waiting. */
const ACTIVE: Record<Phase, number> = { record: 0, file: 2, compare: 3 };

export function CheckingCard({
  fileName,
  fileSize,
  id,
  phase,
  withFile,
}: {
  fileName: string | null;
  fileSize: string | null;
  id: string;
  phase: Phase;
  withFile: boolean;
}) {
  const active = ACTIVE[phase];
  const items = withFile ? STEPS : STEPS.slice(0, 2);
  return (
    <output
      aria-busy="true"
      className="block rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground">
          <FileText aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {fileName ?? `Document ${id}`}
          </p>
          <p className="truncate text-small text-muted-foreground">
            {fileName ? `Document ${id}` : fileSize}
          </p>
        </div>
      </div>
      <ol className="mt-5 flex flex-col gap-3">
        {items.map((item, index) => {
          const state =
            index < active ? 'done' : index === active ? 'active' : 'waiting';
          return (
            <li
              key={item.text}
              className={cn(
                'flex items-center gap-3',
                state === 'active'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {state === 'done' ? (
                <span className="grid size-5 place-items-center rounded-full border border-success text-success">
                  <Check
                    aria-hidden="true"
                    className="size-3"
                    strokeWidth={2.5}
                  />
                </span>
              ) : state === 'active' ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin text-primary motion-reduce:animate-none"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="size-5 rounded-full border border-input"
                />
              )}
              {item.text}
              <span className="sr-only">
                {state === 'done'
                  ? ' (done)'
                  : state === 'active'
                    ? ' (in progress)'
                    : ''}
              </span>
            </li>
          );
        })}
      </ol>
      {withFile ? (
        <p className="mt-4 text-small text-muted-foreground">
          Large files can take a few seconds.
        </p>
      ) : null}
    </output>
  );
}
