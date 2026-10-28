import { createFileRoute, redirect } from '@tanstack/react-router';

import { TemplatesPage } from '#/features/templates/templates-page.tsx';
import { listTemplatesFn } from '#/server/templates.ts';

export const Route = createFileRoute('/_shell/templates')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
  },
  loader: () => listTemplatesFn(),
  component: Templates,
});

function Templates() {
  const data = Route.useLoaderData();
  return (
    <TemplatesPage
      templates={Array.isArray(data) ? data : []}
      error={Array.isArray(data) ? null : data.error}
    />
  );
}
