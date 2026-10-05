import { Link } from "@tanstack/react-router";
import { cn } from "cn";

import { Button } from "#/components/ui/button.tsx";

export function EmptyDocuments({
	className,
	action = true,
}: {
	className?: string;
	/** The dashboard already offers Create beside the greeting. */
	action?: boolean;
}) {
	return (
		<div className={cn("max-w-sm pt-16", className)}>
			<h2 className="text-xl font-semibold tracking-tight">No documents yet</h2>
			<p className="mt-2 leading-relaxed text-muted-foreground">
				Create one when you have a PDF to sign.
			</p>
			{action ? (
				<Button asChild className="mt-6">
					<Link to="/prepare">Create a document</Link>
				</Button>
			) : null}
		</div>
	);
}
