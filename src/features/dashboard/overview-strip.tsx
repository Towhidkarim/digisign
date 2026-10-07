import type { DashboardCounts } from '#/features/dashboard/summary.ts';

const CELLS = [
  { key: 'out', label: 'Out for signature', note: 'Waiting on a signer' },
  { key: 'drafts', label: 'Drafts', note: 'Not sent yet' },
  { key: 'completed', label: 'Completed', note: 'Ready to download' },
  { key: 'attention', label: 'Needs attention', note: 'Declined or expired' },
] as const;

/** Four counts: one joined card on desktop, a 2 by 2 grid of cards on phones. */
export function OverviewStrip({ counts }: { counts: DashboardCounts }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 md:mt-8 md:grid-cols-4 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-card">
      {CELLS.map((cell) => (
        <div
          key={cell.key}
          className="rounded-lg border border-border bg-card p-4 md:rounded-none md:border-0 md:border-l md:p-5 md:first:border-l-0"
        >
          <dt className="text-small text-muted-foreground">{cell.label}</dt>
          <dd className="mt-1 text-3xl leading-10 font-semibold tabular-nums">
            {counts[cell.key]}
          </dd>
          <dd className="hidden text-small text-muted-foreground md:block">
            {cell.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}
