import { Link } from '@tanstack/react-router';
import { FilePlus2 } from 'lucide-react';

import { Button } from '#/components/ui/button.tsx';
import { cn } from '#/lib/utils.ts';

export function EmptyDocuments({
  className,
  action = true,
}: {
  className?: string;
  /** Pages that already show a Create button in their header pass false. */
  action?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-12 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-md bg-accent text-muted-foreground"
      >
        <FilePlus2 className="size-6" strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 text-heading font-semibold">No documents yet</h2>
      <p className="mt-1 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
        Create one when you have a PDF to sign. You place the fields, name who
        signs and in what order, then send.
      </p>
      {action ? (
        <Button asChild size="lg" className="mt-6">
          <Link to="/prepare">Create a document</Link>
        </Button>
      ) : null}
    </div>
  );
}
