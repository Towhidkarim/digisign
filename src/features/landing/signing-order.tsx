import { Check, Lock, type LucideIcon, Send, ShieldCheck } from 'lucide-react';

import { cn } from '#/lib/utils.ts';

type Step = {
  state: 'done' | 'current' | 'waiting' | 'sealed';
  icon: LucideIcon;
  title: string;
  text: string;
};

const STEPS: Step[] = [
  {
    state: 'done',
    icon: Check,
    title: 'You prepare it',
    text: 'Place the fields and set who signs, and in what order.',
  },
  {
    state: 'done',
    icon: Check,
    title: 'Jordan signs',
    text: 'The first person reviews the document and signs.',
  },
  {
    state: 'current',
    icon: Send,
    title: 'Amira is invited',
    text: 'Her link goes out only now, after Jordan has signed.',
  },
  {
    state: 'waiting',
    icon: Lock,
    title: 'Tom waits',
    text: 'No link yet. He is next once Amira has signed.',
  },
  {
    state: 'sealed',
    icon: ShieldCheck,
    title: 'The record is sealed',
    text: 'The finished PDF carries a record anyone can check.',
  },
];

const NODE = {
  done: 'border-success bg-success-bg text-success-fg',
  current: 'border-primary bg-brand-bg text-brand-fg',
  waiting: 'border-border bg-card text-ink-subtle',
  sealed: 'border-dashed border-success bg-card text-success',
} as const;

/** The signing chain as a picture: who has signed, who is invited, who is still waiting. */
export function SigningOrder() {
  return (
    <ol className="grid md:grid-cols-5">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const last = index === STEPS.length - 1;
        return (
          <li
            key={step.title}
            className={cn(
              'relative flex gap-4 pb-8 md:flex-col md:items-center md:gap-4 md:pb-0 md:text-center',
              last && 'pb-0',
            )}
          >
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-8 left-4 h-full w-0.5 -translate-x-1/2 md:top-4 md:left-1/2 md:h-0.5 md:w-full md:translate-x-0 md:-translate-y-1/2',
                  step.state === 'done' ? 'bg-success' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2',
                NODE[step.state],
              )}
            >
              <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
            </span>
            <div className="md:px-2">
              <p className="text-subheading font-semibold text-foreground">
                {step.title}
              </p>
              <p className="mt-1 max-w-[30ch] text-small text-muted-foreground">
                {step.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
