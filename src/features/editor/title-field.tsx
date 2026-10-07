import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '#/lib/utils.ts';

const MAX_TITLE = 200;

/**
 * The document title, edited in place. Enter or leaving the field saves, Escape cancels. The
 * parent decides what saving means and returns an error message to keep the field open.
 */
export function TitleField({
  value,
  disabled,
  onRename,
  className,
}: {
  value: string;
  disabled?: boolean;
  onRename: (title: string) => Promise<string | null>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function open() {
    done.current = false;
    setDraft(value);
    setError('');
    setEditing(true);
  }

  async function commit() {
    if (done.current) return;
    const next = draft.trim();
    if (next === value) {
      done.current = true;
      setEditing(false);
      return;
    }
    if (!next) {
      setError('Give the document a name.');
      return;
    }
    done.current = true;
    const failed = await onRename(next);
    if (failed) {
      done.current = false;
      setError(failed);
      input.current?.focus();
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className={cn('min-w-0', className)}>
        <input
          ref={input}
          value={draft}
          maxLength={MAX_TITLE}
          aria-label="Document name"
          aria-invalid={error ? true : undefined}
          className="h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            } else if (event.key === 'Escape') {
              done.current = true;
              setEditing(false);
            }
          }}
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (disabled) {
    return (
      <p className={cn('truncate text-sm font-semibold', className)}>
        {value || 'Document'}
      </p>
    );
  }

  return (
    <button
      type="button"
      title="Rename document"
      aria-label={`Rename document, ${value || 'Document'}`}
      className={cn(
        'group flex max-w-full cursor-pointer items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      onClick={open}
    >
      <span className="truncate text-sm font-semibold">
        {value || 'Document'}
      </span>
      <Pencil
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-100"
        strokeWidth={1.75}
      />
    </button>
  );
}
