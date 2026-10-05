import { createFileRoute } from "@tanstack/react-router";

import {
	DocumentList,
	DocumentLoadError,
	DocumentSheet,
} from "#/features/dashboard/document-list.tsx";
import { EmptyDocuments } from "#/features/dashboard/empty-state.tsx";
import { countSentence } from "#/features/dashboard/format.ts";
import { DocumentsPending } from "#/features/dashboard/skeleton.tsx";
import { listDocumentsFn } from "#/server/documents.ts";

export const Route = createFileRoute("/documents/")({
	loader: () => listDocumentsFn(),
	pendingMs: 200,
	pendingComponent: DocumentsPending,
	component: DocumentsIndex,
});

function DocumentsIndex() {
	const data = Route.useLoaderData();
	const summary = Array.isArray(data) ? countSentence(data) : "";
	return (
		<>
			<h1 className="text-[clamp(1.7rem,3vw,2.1rem)] font-semibold tracking-tight">
				Documents
			</h1>
			{summary ? <p className="mt-2 text-muted-foreground">{summary}</p> : null}
			{!Array.isArray(data) ? (
				<DocumentLoadError className="mt-8" message={data.error} />
			) : data.length === 0 ? (
				<DocumentSheet className="py-8">
					<EmptyDocuments className="pt-0" />
				</DocumentSheet>
			) : (
				<DocumentList documents={data} />
			)}
		</>
	);
}
