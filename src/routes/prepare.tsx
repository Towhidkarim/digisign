import { createFileRoute, redirect } from '@tanstack/react-router';

import { lazyDesk } from '#/lib/lazy-desk.tsx';
import { getSessionFn } from '#/server/session.ts';

const PrepareDesk = lazyDesk<object>(
  import.meta.env.SSR
    ? null
    : () =>
        import('#/features/editor/prepare-desk.tsx').then((module) => ({
          default: module.PrepareDesk,
        })),
);

export const Route = createFileRoute('/prepare')({
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { documentId?: string; kind?: 'template' } => {
    const kind = search.kind === 'template' ? ('template' as const) : undefined;
    if (
      typeof search.documentId !== 'string' ||
      search.documentId.length === 0
    ) {
      return kind ? { kind } : {};
    }
    return kind
      ? { documentId: search.documentId, kind }
      : { documentId: search.documentId };
  },
  beforeLoad: async () => {
    if (!(await getSessionFn())) throw redirect({ to: '/login' });
  },
  component: PrepareDesk,
});
