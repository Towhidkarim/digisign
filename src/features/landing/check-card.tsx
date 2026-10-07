import { Check, ShieldCheck } from 'lucide-react';

const ROWS = [
  {
    title: 'A signed record exists',
    text: 'It was made when the last person signed.',
  },
  {
    title: 'This file has not changed',
    text: 'It matches the signed record exactly.',
  },
  {
    title: 'All three signatures are in it',
    text: 'Each one is part of the signed record.',
  },
];

/** A small copy of the public check result, so the promise is something you can see. */
export function CheckCard() {
  return (
    <figure
      aria-label="Example of a check result"
      className="m-0 overflow-hidden rounded-xl border border-border bg-card shadow-md"
    >
      <div className="flex items-start gap-3 bg-success-bg p-4 text-success-fg">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-6 shrink-0"
          strokeWidth={1.75}
        />
        <div>
          <p className="text-subheading font-semibold">Genuine and unchanged</p>
          <p className="text-small">
            This file is exactly what DigiSign produced when signing finished.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border px-4">
        {ROWS.map((row) => (
          <li key={row.title} className="flex items-start gap-3 py-3">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-success"
              strokeWidth={2}
            />
            <div>
              <p className="font-medium text-foreground">{row.title}</p>
              <p className="text-small text-muted-foreground">{row.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="border-t border-border bg-muted px-4 py-2 text-xs text-ink-subtle">
        Example result from the public check page
      </figcaption>
    </figure>
  );
}
