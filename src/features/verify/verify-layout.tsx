import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { Logo } from '#/components/logo.tsx';
import { Button } from '#/components/ui/button.tsx';

/** The public page frame: a simple header and one centred column. No sidebar. */
export function VerifyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <Logo className="max-sm:min-h-11" />
        <Button asChild variant="ghost" className="max-sm:min-h-11">
          <Link to="/login">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-[720px] px-4 pt-10 pb-16 sm:pt-12">
        {children}
      </main>
    </div>
  );
}
