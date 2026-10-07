import { createFileRoute } from '@tanstack/react-router';

import { SigningSkeleton } from '#/features/sign/signing-skeleton.tsx';
import { lazyDesk } from '#/lib/lazy-desk.tsx';

const SigningDesk = lazyDesk<object>(
  import.meta.env.SSR
    ? null
    : () =>
        import('#/features/sign/signing-desk.tsx').then((module) => ({
          default: module.SigningDesk,
        })),
  <SigningSkeleton />,
);

export const Route = createFileRoute('/sign')({
  ssr: false,
  component: SigningDesk,
});
