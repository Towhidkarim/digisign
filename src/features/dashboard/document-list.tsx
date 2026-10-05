import { Link, useRouter } from "@tanstack/react-router";
import { cn } from "cn";

import { Button } from "#/components/ui/button.tsx";
import {
	displayTitle,
	formatUpdated,
	progressLine,
	statusLabel,
	statusTone,
} from "#/features/dashboard/format.ts";
import type { OwnedDocument } from "#/server/domain/documents.ts";

export function DocumentList({
	documents,
}: {
	documents: readonly OwnedDocument[];
}) {
	return (
		<DocumentSheet>
			<ul>
				{documents.map((document, index) => (
					<li
						key={document.id}
						className={
							index < documents.length - 1
								? "border-b border-[var(--tide)]"
								: undefined
						}
					>
						<DocumentRow document={document} />
					</li>
				))}
			</ul>
		</DocumentSheet>
	);
}

function DocumentRow({ document }: { document: OwnedDocument }) {
	const progress = progressLine(document);
	return (
		<div className="-mx-6 flex items-start justify-between gap-4 px-6 py-5 hover:bg-accent md:gap-8">
			<Link
				to="/documents/$documentId"
				params={{ documentId: document.id }}
				preload="intent"
				className="min-w-0 flex-1 rounded-sm text-inherit no-underline outline-none hover:text-inherit focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<p className="font-medium break-words">
					{displayTitle(document.title)}
				</p>
				<p className={cn("mt-1 text-sm", statusTone(document.status))}>
					{statusLabel(document.status)}
				</p>
				{progress ? (
					<p className="mt-1 text-sm break-words text-muted-foreground">
						{progress}
					</p>
				) : null}
			</Link>
			<div className="flex shrink-0 flex-col items-end gap-2">
				<time
					dateTime={new Date(document.updatedAt).toISOString()}
					className="pt-0.5 text-right text-sm whitespace-nowrap text-muted-foreground tabular-nums"
				>
					<span className="sr-only">Updated </span>
					{formatUpdated(document.updatedAt)}
				</time>
				{document.status === "draft" ? (
					<Link
						to="/prepare"
						search={{ documentId: document.id }}
						className="text-sm font-medium text-primary no-underline hover:text-primary"
					>
						Continue editing
					</Link>
				) : null}
			</div>
		</div>
	);
}

/** One sheet of paper on the desk, edged in the line color. */
export function DocumentSheet({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mt-10 overflow-hidden rounded-[0.9rem] border border-border bg-card px-6",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function DocumentLoadError({
	message,
	className,
}: {
	message: string;
	className?: string;
}) {
	const router = useRouter();
	return (
		<div role="alert" className={className}>
			<p className="max-w-[48ch] text-destructive">{message}</p>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-4"
				onClick={() => {
					void router.invalidate();
				}}
			>
				Try again
			</Button>
		</div>
	);
}
