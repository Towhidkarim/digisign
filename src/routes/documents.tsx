import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { AppShell } from '#/features/dashboard/app-shell.tsx';
import { getSessionFn } from '#/server/session.ts';

export const Route = createFileRoute('/documents')({
  ssr: false,
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session) throw redirect({ to: '/login' });
    return session;
  },
  component: DocumentsLayout,
});

function DocumentsLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
