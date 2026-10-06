import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { DocumentLoadError } from "#/features/dashboard/document-list.tsx";
import { DocumentsCard } from "#/features/dashboard/documents-card.tsx";
import { EmptyDocuments } from "#/features/dashboard/empty-state.tsx";
import { DocumentsPending } from "#/features/dashboard/skeleton.tsx";
import {
	countDocuments,
	dashboardSubtitle,
} from "#/features/dashboard/summary.ts";
import { listDocumentsFn } from "#/server/documents.ts";

export const Route = createFileRoute("/documents/")({
	loader: () => listDocumentsFn(),
	pendingMs: 200,
	pendingComponent: DocumentsPending,
	component: DocumentsIndex,
});

function DocumentsIndex() {
	const data = Route.useLoaderData();
	const documents = Array.isArray(data) ? data : [];
	const total = documents.length;
	const subtitle = Array.isArray(data)
		? total === 0
			? "Everything you send for signature appears here."
			: `${total} ${total === 1 ? "document" : "documents"}. ${dashboardSubtitle(countDocuments(documents), total)}`
		: "";
	return (
		<>
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
				<div className="min-w-0">
					<h1 className="text-title font-semibold tracking-tight">Documents</h1>
					{subtitle ? (
						<p className="mt-1 text-muted-foreground">{subtitle}</p>
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
			) : total === 0 ? (
				<div className="mt-8 rounded-lg border border-border bg-card">
					<EmptyDocuments action={false} />
				</div>
			) : (
				<DocumentsCard documents={documents} />
			)}
		</>
	);
}
