import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";

/** A document that could not be opened: says what happened, and offers Try again and a way back. */
export function DocumentLoadFailed({ message }: { message?: string }) {
	const router = useRouter();
	return (
		<div>
			<Link
				to="/documents"
				className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground no-underline hover:text-foreground"
			>
				<ChevronLeft className="size-4" strokeWidth={1.75} />
				Documents
			</Link>
			<Alert variant="destructive" className="mt-6 max-w-xl">
				<TriangleAlert aria-hidden="true" />
				<AlertTitle>We could not open this document</AlertTitle>
				<AlertDescription>
					{message ?? "Something went wrong while loading it."} Try again, or go
					back to your documents.
				</AlertDescription>
				<div className="mt-4 flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="bg-card text-foreground"
						onClick={() => {
							void router.invalidate();
						}}
					>
						Try again
					</Button>
					<Button asChild variant="ghost" size="sm">
						<Link to="/documents">Back to documents</Link>
					</Button>
				</div>
			</Alert>
		</div>
	);
}
