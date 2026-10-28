import { PenLine } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button.tsx';
import { cn } from '#/lib/utils.ts';
import { signAsOwnerFn } from '#/server/documents.ts';

/**
 * Opens the owner's own turn on a document. It asks for a fresh signing link (nothing is
 * mailed) and goes there, so the owner signs exactly the way everyone else does.
 */
export function SignNowButton({
  signerId,
  className,
  size = 'sm',
}: {
  signerId: string;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open() {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await signAsOwnerFn({ data: { signerId } });
    if ('error' in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    window.location.assign(result.url);
  }
  return (
    <span className={cn('relative z-10 inline-flex flex-col', className)}>
      <Button type="button" size={size} disabled={busy} onClick={open}>
        <PenLine strokeWidth={1.75} />
        {busy ? 'Opening…' : 'Sign now'}
      </Button>
      {error ? (
        <span className="mt-1 text-small text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
