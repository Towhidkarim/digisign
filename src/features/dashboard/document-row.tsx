import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText } from "lucide-react";

import { isDocumentStatus, StatusBadge } from "#/components/status-badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	displayTitle,
	formatRelative,
	formatWhen,
	metaLine,
} from "#/features/dashboard/format.ts";
import { cn } from "#/lib/utils.ts";
import type { OwnedDocument } from "#/server/domain/documents.ts";

/** One segment per signer: brand when signed, brand-soft while waiting. */
function Progress({ signers, signed }: { signers: number; signed: number }) {
	if (signers === 0) return null;
	return (
		<div
			role="img"
			aria-label={`${signed} of ${signers} signed`}
			className="mt-2 flex gap-[3px]"
		>
			{Array.from({ length: signers }, (_, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative segments
					key={index}
					className={cn(
						"h-1 w-7 rounded-xs",
						index < signed ? "bg-primary" : "bg-brand-soft",
					)}
				/>
			))}
		</div>
	);
}

function When({ updatedAt }: { updatedAt: number }) {
	return (
		<time
			dateTime={new Date(updatedAt).toISOString()}
			title={formatWhen(updatedAt)}
			className="text-xs whitespace-nowrap text-ink-subtle"
		>
			<span className="sr-only">Updated </span>
			{formatRelative(updatedAt)}
		</time>
	);
}

/** Always visible for drafts: the editor is the next step, so it should not wait for a hover. */
function ContinueEditing({
	id,
	className,
}: {
	id: string;
	className?: string;
}) {
	return (
		<Button
			asChild
			variant="outline"
			size="sm"
			className={cn("relative z-10 shrink-0 text-primary", className)}
		>
			<Link to="/prepare" search={{ documentId: id }}>
				Continue editing
			</Link>
		</Button>
	);
}

/** One document in a list. The title link covers the whole row; draft rows also carry a "Continue editing" button above it. */
export function DocumentRow({ document }: { document: OwnedDocument }) {
	const status = isDocumentStatus(document.status) ? document.status : "draft";
	const muted = status === "voided" || status === "declined";
	return (
		<div className="group relative flex min-h-[72px] items-start gap-4 px-4 py-4 transition-colors hover:bg-accent md:items-center md:px-5">
			<span
				aria-hidden="true"
				className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-muted-foreground group-hover:bg-card"
			>
				<FileText className="size-5" strokeWidth={1.75} />
			</span>
			<div className="min-w-0 flex-1">
				<Link
					to="/documents/$documentId"
					params={{ documentId: document.id }}
					preload="intent"
					className={cn(
						"block rounded-md text-subheading font-semibold break-words no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset",
						muted
							? "text-muted-foreground hover:text-muted-foreground"
							: "text-foreground hover:text-foreground",
					)}
				>
					{displayTitle(document.title)}
				</Link>
				<p className="mt-0.5 text-small break-words text-muted-foreground">
					{metaLine(document)}
				</p>
				<div className="mt-2 flex items-center gap-3 md:hidden">
					<StatusBadge status={status} />
					<When updatedAt={document.updatedAt} />
				</div>
				<Progress signers={document.signers} signed={document.signed} />
				{status === "draft" ? (
					<ContinueEditing id={document.id} className="mt-3 md:hidden" />
				) : null}
			</div>
			{status === "draft" ? (
				<ContinueEditing id={document.id} className="hidden md:inline-flex" />
			) : null}
			<div className="hidden shrink-0 flex-col items-end gap-1.5 md:flex">
				<StatusBadge status={status} />
				<When updatedAt={document.updatedAt} />
			</div>
			<ChevronRight
				aria-hidden="true"
				className="mt-2 size-5 shrink-0 text-ink-subtle md:mt-0"
				strokeWidth={1.75}
			/>
		</div>
	);
}
