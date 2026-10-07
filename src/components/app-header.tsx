import type { ReactNode } from 'react';

import { Logo } from '#/components/logo.tsx';
import { cn } from '#/lib/utils.ts';

/** Logo on the left, caller's controls on the right. Used by the landing, auth and signing screens. */
export function AppHeader({
  home = '/',
  bordered = false,
  className,
  children,
}: {
  home?: '/' | '/dashboard';
  /** A full-width bar with a hairline, for the full-bleed tools. */
  bordered?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        bordered ? 'border-b border-border bg-card px-3 py-2' : 'pb-4',
        className,
      )}
    >
      <Logo to={home} />
      {children}
    </header>
  );
}
