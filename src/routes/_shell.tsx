import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppShell } from '#/features/dashboard/app-shell.tsx';
import { getSessionFn } from '#/server/session.ts';

/**
 * One sidebar for every page that can show it. Signed-in visitors get the shell around the
 * page; signed-out visitors get the bare page (only /verify is reachable that way). Pages
 * that need an account redirect themselves in their own beforeLoad.
 */
export const Route = createFileRoute('/_shell')({
  ssr: false,
  beforeLoad: async () => ({ session: await getSessionFn() }),
  component: ShellLayout,
});

function ShellLayout() {
  const { session } = Route.useRouteContext();
  if (!session) return <Outlet />;
  return (
    <AppShell user={session.user}>
      <Outlet />
    </AppShell>
  );
}
