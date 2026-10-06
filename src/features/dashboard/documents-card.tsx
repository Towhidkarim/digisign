import { Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";

import { Input } from "#/components/ui/input.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/components/ui/tabs.tsx";
import { DocumentRow } from "#/features/dashboard/document-row.tsx";
import {
	countDocuments,
	type DocumentFilter,
	matchesFilter,
} from "#/features/dashboard/summary.ts";
import type { OwnedDocument } from "#/server/domain/documents.ts";

const TABS: readonly { value: DocumentFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "out", label: "Out for signature" },
	{ value: "drafts", label: "Drafts" },
	{ value: "completed", label: "Completed" },
	{ value: "attention", label: "Needs attention" },
];

const SHOWN = 6;

/** Recent documents with client-side filter tabs. Search is a placeholder until it exists. */
export function DocumentsCard({
	documents,
}: {
	documents: readonly OwnedDocument[];
}) {
	const [filter, setFilter] = useState<DocumentFilter>("all");
	const counts = countDocuments(documents);
	const countOf = (value: DocumentFilter) =>
		value === "all" ? documents.length : counts[value];
	const matching = documents.filter((document) =>
		matchesFilter(document, filter),
	);
	const shown = matching.slice(0, SHOWN);

	return (
		<Tabs
			value={filter}
			onValueChange={(value) => setFilter(value as DocumentFilter)}
			className="mt-6 overflow-hidden rounded-lg border border-border bg-card md:mt-8"
		>
			<div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
				<TabsList
					aria-label="Filter documents"
					className="-mx-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:gap-1 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
				>
					{TABS.map((tab) => (
						<TabsTrigger
							key={tab.value}
							value={tab.value}
							className="h-10 rounded-full border border-input px-4 data-[state=active]:border-transparent md:h-9 md:rounded-md md:border-0 md:px-3"
						>
							{tab.label}
							<span className="hidden text-xs tabular-nums md:inline">
								{countOf(tab.value)}
							</span>
						</TabsTrigger>
					))}
				</TabsList>
				<div className="relative hidden md:block md:w-64">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
						strokeWidth={1.75}
					/>
					<Input
						type="search"
						disabled
						aria-label="Search documents"
						placeholder="Search documents"
						className="h-10 pl-9"
					/>
				</div>
			</div>
			<TabsContent value={filter}>
				{shown.length === 0 ? (
					<p className="px-5 py-12 text-center text-sm text-muted-foreground">
						No documents in this view.
					</p>
				) : (
					<ul className="divide-y divide-border">
						{shown.map((document) => (
							<li key={document.id}>
								<DocumentRow document={document} />
							</li>
						))}
					</ul>
				)}
			</TabsContent>
			<div className="flex items-center justify-between gap-4 border-t border-border bg-accent px-4 py-3 text-small text-muted-foreground md:px-5">
				<span>
					Showing {shown.length} of {matching.length}{" "}
					{matching.length === 1 ? "document" : "documents"}
				</span>
				<Link
					to="/documents"
					preload="intent"
					className="inline-flex items-center gap-1.5 text-sm font-medium text-primary no-underline hover:text-brand-hover"
				>
					All documents
					<ArrowRight className="size-4" strokeWidth={1.75} />
				</Link>
			</div>
		</Tabs>
	);
}
