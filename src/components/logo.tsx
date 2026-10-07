import { Link } from '@tanstack/react-router';

import { cn } from '#/lib/utils.ts';

/** The DigiSign mark and name. One implementation for every screen. */
export function Logo({
  to = '/',
  className,
}: {
  /** null draws the mark without a link, for screens that must not navigate away. */
  to?: '/' | '/dashboard' | null;
  className?: string;
}) {
  const classes = cn(
    'inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground no-underline hover:text-foreground',
    className,
  );
  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 64 64"
          className="size-8"
          fill="none"
        >
          <path
            d="M17 31.5 27.5 42 47 20"
            stroke="currentColor"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16 52h32"
            stroke="currentColor"
            strokeOpacity=".6"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      DigiSign
    </>
  );
  if (to === null) return <span className={classes}>{content}</span>;
  return (
    <Link to={to} className={classes}>
      {content}
    </Link>
  );
}
