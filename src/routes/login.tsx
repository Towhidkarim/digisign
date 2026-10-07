import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthForm } from '#/features/auth/auth-form.tsx';
import { getSessionFn } from '#/server/session.ts';

export const Route = createFileRoute('/login')({
  ssr: false,
  beforeLoad: async () => {
    if (await getSessionFn()) throw redirect({ to: '/dashboard' });
  },
  component: () => <AuthForm mode="login" />,
});
