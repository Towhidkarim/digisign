import { Skeleton } from "#/components/ui/skeleton.tsx";
import { VerifyLayout } from "#/features/verify/verify-layout.tsx";

/** The public check page while its screen loads. Light: it must not pull in the PDF libraries. */
export function VerifyPending() {
	return (
		<VerifyLayout>
			<div aria-busy="true">
				<p className="sr-only">Loading</p>
				<Skeleton className="h-9 w-72 max-w-full" />
				<Skeleton className="mt-3 h-4 w-full" />
				<Skeleton className="mt-2 h-4 w-2/3" />
				<Skeleton className="mt-8 h-96 w-full rounded-xl" />
			</div>
		</VerifyLayout>
	);
}
