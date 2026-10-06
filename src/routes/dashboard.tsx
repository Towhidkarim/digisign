import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { AppShell } from "#/features/dashboard/app-shell.tsx";
import {
	DocumentList,
	DocumentLoadError,
	DocumentSheet,
} from "#/features/dashboard/document-list.tsx";
import { EmptyDocuments } from "#/features/dashboard/empty-state.tsx";
import { countSentence, deskPreview } from "#/features/dashboard/format.ts";
import { DeskSkeleton } from "#/features/dashboard/skeleton.tsx";
import { listDocumentsFn } from "#/server/documents.ts";
import { getSessionFn } from "#/server/session.ts";

const RECENT = 6;

function DashboardPending() {
	return <DeskSkeleton sheet />;
}

export const Route = createFileRoute("/dashboard")({
	ssr: false,
	beforeLoad: async () => {
		const session = await getSessionFn();
		if (!session) throw redirect({ to: "/login" });
		return session;
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
	const summary = Array.isArray(data) ? countSentence(data) : "";
	const preview = Array.isArray(data) ? deskPreview(data, RECENT) : [];
	return (
		<AppShell>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-[clamp(1.7rem,3vw,2.1rem)] font-semibold tracking-tight">
						Hello, {name}.
					</h1>
					{summary ? (
						<p className="mt-2 text-muted-foreground">{summary}</p>
					) : null}
				</div>
				<Button asChild className="shrink-0">
					<Link to="/prepare">
						<Plus strokeWidth={1.75} />
						Create a document
					</Link>
				</Button>
			</div>
			{!Array.isArray(data) ? (
				<DocumentLoadError className="mt-8" message={data.error} />
			) : data.length === 0 ? (
				<DocumentSheet className="py-8">
					<EmptyDocuments action={false} className="pt-0" />
				</DocumentSheet>
			) : (
				<>
					<DocumentList documents={preview} />
					{data.length > preview.length ? (
						<Link
							to="/documents"
							preload="intent"
							className="mt-4 inline-block text-sm font-medium text-primary no-underline hover:text-primary"
						>
							All documents
						</Link>
					) : null}
				</>
			)}
		</AppShell>
	);
}
