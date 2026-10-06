import { useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

/** The list could not load: say so, say what to do, and offer Try again. */
export function DocumentLoadError({
	message,
	className,
}: {
	message: string;
	className?: string;
}) {
	const router = useRouter();
	return (
		<Alert variant="destructive" className={cn("max-w-xl", className)}>
			<TriangleAlert aria-hidden="true" />
			<AlertTitle>We could not load your documents</AlertTitle>
			<AlertDescription>{message} Try again in a moment.</AlertDescription>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-4 bg-card text-foreground"
				onClick={() => {
					void router.invalidate();
				}}
			>
				Try again
			</Button>
		</Alert>
	);
}
