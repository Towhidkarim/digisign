import { createFileRoute } from '@tanstack/react-router';
import { useRef } from 'react';

import { DocumentDesk } from '#/features/dashboard/document-desk.tsx';
import { DocumentLoadFailed } from '#/features/dashboard/document-error.tsx';
import { DocumentPending } from '#/features/dashboard/skeleton.tsx';
import { useDocumentPolling } from '#/features/dashboard/use-document-polling.ts';
import { getDocumentFn } from '#/server/documents.ts';
import type { OwnedDocumentDetail } from '#/server/domain/documents.ts';

export const Route = createFileRoute('/documents/$documentId')({
  loader: ({ params }) =>
    getDocumentFn({ data: { documentId: params.documentId } }),
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: DocumentPending,
  errorComponent: () => <DocumentLoadFailed />,
  component: DocumentPage,
});

function DocumentPage() {
  const data = Route.useLoaderData();
  const { documentId } = Route.useParams();
  // A refresh that fails must not replace a page the person is already looking at.
  const lastGood = useRef<OwnedDocumentDetail | null>(null);
  if (!('error' in data)) lastGood.current = data;
  const shown =
    'error' in data
      ? lastGood.current?.id === documentId
        ? lastGood.current
        : null
      : data;
  useDocumentPolling({
    version: data,
    status: shown?.status ?? 'draft',
    busy: shown?.busy ?? false,
    failed: 'error' in data && shown != null,
  });
  if (!shown) {
    return (
      <DocumentLoadFailed message={'error' in data ? data.error : undefined} />
    );
  }
  return <DocumentDesk key={shown.id} document={shown} />;
}
