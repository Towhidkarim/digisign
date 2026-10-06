import { createFileRoute } from "@tanstack/react-router";

import { DocumentDesk } from "#/features/dashboard/document-desk.tsx";
import { DocumentLoadFailed } from "#/features/dashboard/document-error.tsx";
import { DocumentPending } from "#/features/dashboard/skeleton.tsx";
import { getDocumentFn } from "#/server/documents.ts";

export const Route = createFileRoute("/documents/$documentId")({
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
	if ("error" in data) {
		return <DocumentLoadFailed message={data.error} />;
	}
	return <DocumentDesk key={data.id} document={data} />;
}
