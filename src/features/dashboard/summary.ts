import type { OwnedDocument } from "#/server/domain/documents.ts";

export type DashboardCounts = {
	out: number;
	drafts: number;
	completed: number;
	attention: number;
};

export type DocumentFilter =
	| "all"
	| "out"
	| "drafts"
	| "completed"
	| "attention";

export function matchesFilter(
	document: OwnedDocument,
	filter: DocumentFilter,
): boolean {
	switch (filter) {
		case "all":
			return true;
		case "out":
			return document.status === "in_progress";
		case "drafts":
			return document.status === "draft";
		case "completed":
			return document.status === "completed";
		case "attention":
			return document.status === "declined" || document.status === "expired";
	}
}

export function countDocuments(
	documents: readonly OwnedDocument[],
): DashboardCounts {
	const count = (filter: DocumentFilter) =>
		documents.filter((document) => matchesFilter(document, filter)).length;
	return {
		out: count("out"),
		drafts: count("drafts"),
		completed: count("completed"),
		attention: count("attention"),
	};
}

export function greeting(hour: number): string {
	if (hour < 12) return "Good morning";
	if (hour < 18) return "Good afternoon";
	return "Good evening";
}

/** One or two plain sentences about what is waiting. */
export function dashboardSubtitle(
	counts: DashboardCounts,
	total: number,
): string {
	if (total === 0) return "Create your first document to get started.";
	const parts = [
		counts.out > 0
			? `${counts.out} ${counts.out === 1 ? "document is" : "documents are"} out for signature.`
			: "",
		counts.attention > 0
			? `${counts.attention} ${counts.attention === 1 ? "needs" : "need"} your attention.`
			: "",
	].filter((part) => part.length > 0);
	return parts.length > 0 ? parts.join(" ") : "Nothing needs your attention.";
}
