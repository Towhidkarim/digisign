import { Check, FileText, Lock, Send, ShieldCheck } from 'lucide-react';

import { cn } from '#/lib/utils.ts';

type Row = {
  order: number;
  name: string;
  initials: string;
  tone: string;
  state: 'signed' | 'next' | 'waiting';
};

const ROWS: Row[] = [
  {
    order: 1,
    name: 'Jordan Hale',
    initials: 'JH',
    tone: 'border-signer-1 text-signer-1',
    state: 'signed',
  },
  {
    order: 2,
    name: 'Amira Solano',
    initials: 'AS',
    tone: 'border-signer-2 text-signer-2',
    state: 'next',
  },
  {
    order: 3,
    name: 'Tom Eriksen',
    initials: 'TE',
    tone: 'border-signer-5 text-signer-5',
    state: 'waiting',
  },
];

const STATE = {
  signed: {
    label: 'Signed',
    icon: Check,
    className: 'bg-success-bg text-success-fg',
  },
  next: {
    label: 'Invited now',
    icon: Send,
    className: 'bg-brand-bg text-brand-fg',
  },
  waiting: {
    label: 'Waiting',
    icon: Lock,
    className: 'bg-neutral-bg text-neutral-fg',
  },
} as const;

/** The hero picture: one document, three signers in order, a check that passes. */
export function HeroSheet() {
  return (
    <figure
      aria-label="Example: a service agreement with three signers in order, and the check on the finished file"
      className="landing-rise relative isolate m-0 pb-14 sm:pl-6"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-2 top-4 bottom-8 -z-10 rotate-2 rounded-xl bg-brand-bg sm:inset-x-6"
      />
      <div className="on-paper rounded-xl border border-border bg-card p-5 shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-4">
          <div className="flex min-w-48 flex-1 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-subheading font-semibold text-foreground">
                Service agreement
              </p>
              <p className="text-small text-muted-foreground">
                3 signers, in order
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-bg py-1 pr-3 pl-2 text-xs font-medium text-brand-fg">
            <Send aria-hidden="true" className="size-3.5" />
            Out for signature
          </span>
        </div>

        <div aria-hidden="true" className="grid gap-2 py-5">
          <span className="block h-2 w-[94%] rounded-full bg-muted" />
          <span className="block h-2 w-[78%] rounded-full bg-muted" />
          <span className="block h-2 w-[88%] rounded-full bg-muted" />
        </div>

        <ol className="grid gap-2.5">
          {ROWS.map((row) => {
            const state = STATE[row.state];
            const Icon = state.icon;
            return (
              <li
                key={row.order}
                className={cn(
                  'rounded-lg border px-3 py-2.5',
                  row.state === 'waiting'
                    ? 'border-dashed border-border'
                    : 'border-border bg-card',
                  row.state === 'next' && 'border-primary bg-brand-bg/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full border-2 bg-card text-xs font-semibold',
                      row.tone,
                    )}
                  >
                    {row.initials}
                  </span>
                  <p className="min-w-0 flex-1 truncate font-medium text-foreground">
                    <span className="mr-2 text-muted-foreground">
                      {row.order}.
                    </span>
                    {row.name}
                  </p>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-2.5 pl-2 text-xs font-medium',
                      state.className,
                    )}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                    {state.label}
                  </span>
                </div>
                {row.state === 'signed' && (
                  <svg
                    viewBox="0 0 240 40"
                    aria-hidden="true"
                    className="mt-1 ml-11 block h-8 w-40 max-w-full"
                  >
                    <title>A drawn signature</title>
                    <path
                      pathLength={1}
                      className="landing-sign fill-none stroke-primary"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 26 C 20 6, 28 4, 38 14 C 45 23, 48 36, 56 26 C 64 14, 68 6, 77 19 C 84 28, 91 32, 102 21 C 114 9, 128 11, 136 22 C 142 30, 158 27, 175 19 C 188 13, 204 15, 226 10"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="landing-rise absolute -bottom-0 left-0 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-md [animation-delay:0.9s] sm:left-0">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-bg text-success-fg">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-small font-semibold text-foreground">
            Genuine and unchanged
          </p>
          <p className="text-xs text-muted-foreground">Checked by anyone</p>
        </div>
      </div>
    </figure>
  );
}
