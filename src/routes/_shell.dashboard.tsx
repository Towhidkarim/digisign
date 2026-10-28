import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { Button } from '#/components/ui/button.tsx';
import { DocumentLoadError } from '#/features/dashboard/document-list.tsx';
import { DocumentRow } from '#/features/dashboard/document-row.tsx';
import { DocumentsCard } from '#/features/dashboard/documents-card.tsx';
import { EmptyDocuments } from '#/features/dashboard/empty-state.tsx';
import { OverviewStrip } from '#/features/dashboard/overview-strip.tsx';
import { DashboardPending } from '#/features/dashboard/skeleton.tsx';
import {
  countDocuments,
  dashboardSubtitle,
  greeting,
} from '#/features/dashboard/summary.ts';
import { listDocumentsFn } from '#/server/documents.ts';

export const Route = createFileRoute('/_shell/dashboard')({
  ssr: false,
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
    return { user: context.session.user };
  },
  loader: () => listDocumentsFn(),
  pendingMs: 200,
  pendingComponent: DashboardPending,
  component: DashboardPage,
});

function DashboardPage() {
  const data = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const name = user.name.trim().split(/\s+/)[0] || user.name;
  const documents = Array.isArray(data) ? data : [];
  const counts = countDocuments(documents);
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <h1 className="text-title font-semibold tracking-tight">
            {greeting(new Date().getHours())}, {name}
          </h1>
          {Array.isArray(data) ? (
            <p className="mt-1 text-muted-foreground">
              {dashboardSubtitle(counts, documents.length)}
            </p>
          ) : null}
        </div>
        <Button asChild size="lg" className="h-11 w-full md:h-10 md:w-auto">
          <Link to="/prepare">
            <Plus strokeWidth={1.75} />
            Create a document
          </Link>
        </Button>
      </div>
      {!Array.isArray(data) ? (
        <DocumentLoadError className="mt-8" message={data.error} />
      ) : documents.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-card">
          <EmptyDocuments action={false} />
        </div>
      ) : (
        <>
          {counts.you > 0 ? (
            <section
              aria-label="Waiting for your signature"
              className="mt-6 overflow-hidden rounded-lg border border-primary bg-card md:mt-8"
            >
              <h2 className="border-b border-border bg-brand-soft px-4 py-3 text-subheading font-semibold md:px-5">
                Waiting for your signature
              </h2>
              <ul className="divide-y divide-border">
                {documents
                  .filter((document) => document.youToSign)
                  .slice(0, 5)
                  .map((document) => (
                    <li key={document.id}>
                      <DocumentRow document={document} />
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
          <OverviewStrip counts={counts} />
          <DocumentsCard documents={documents} limit={6} />
        </>
      )}
    </>
  );
}
