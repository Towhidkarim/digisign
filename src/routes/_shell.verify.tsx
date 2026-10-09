import { createFileRoute } from '@tanstack/react-router';

import { VerifyPending } from '#/features/verify/verify-pending.tsx';
import { lazyDesk } from '#/lib/lazy-desk.tsx';

const VerifyDesk = lazyDesk<{ initialId?: string; signedIn?: boolean }>(
  import.meta.env.SSR
    ? null
    : () =>
        import('#/features/verify/verify-desk.tsx').then((module) => ({
          default: module.VerifyDesk,
        })),
  <VerifyPending />,
);

export const Route = createFileRoute('/_shell/verify')({
  ssr: false,
  component: VerifyPage,
});

function VerifyPage() {
  // Signed-in visitors already have the shell's header and sidebar, so the page drops its own frame.
  const { session } = Route.useRouteContext();
  return <VerifyDesk signedIn={Boolean(session)} />;
}
