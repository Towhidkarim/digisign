import { Skeleton } from '#/components/ui/skeleton.tsx';

/** The signing desk while it loads: header, progress strip and a page. Light, no PDF libraries. */
export function SigningSkeleton() {
  return (
    <div className="flex h-svh flex-col bg-background" aria-busy="true">
      <p className="sr-only">Opening the document</p>
      <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-60 max-w-full" />
        </div>
      </div>
      <div className="border-b border-border bg-card px-4 py-3 md:hidden">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-muted p-4">
        <Skeleton className="mx-auto h-[640px] w-full max-w-[720px] rounded-md" />
      </div>
      <div className="border-t border-border bg-card p-4">
        <Skeleton className="h-12 w-full rounded-lg md:ml-auto md:w-44" />
      </div>
    </div>
  );
}
