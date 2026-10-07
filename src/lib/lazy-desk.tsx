import { type ComponentType, lazy, type ReactElement, Suspense } from 'react';

import { DeskSkeleton } from '#/features/dashboard/skeleton.tsx';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

/**
 * Loads a browser-only screen on demand.
 *
 * Call it as `lazyDesk(import.meta.env.SSR ? null : () => import("..."))`. Vite turns
 * `import.meta.env.SSR` into `true` in the server build and drops the `import()`, so heavy
 * browser libraries (pdf-lib, pdf.js, fontkit) stay out of the Worker bundle. In the browser
 * the screen loads as its own chunk.
 */
export function lazyDesk<P extends object>(
  load: Loader<P> | null,
  fallback: ReactElement = <DeskSkeleton />,
): (props: P) => ReactElement | null {
  if (!load) return () => null;
  const Screen = lazy(load);
  return function Desk(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Screen {...props} />
      </Suspense>
    );
  };
}
