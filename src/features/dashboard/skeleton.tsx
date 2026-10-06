import { Skeleton } from "#/components/ui/skeleton.tsx";

/** The document list, inside the sidebar, while that list is loading. */
export function DocumentsPending() {
	return (
		<div aria-busy="true">
			<p className="sr-only">Loading documents</p>
			<Skeleton className="h-9 w-40" />
			<Skeleton className="mt-3 h-4 w-56" />
			<div className="mt-10 overflow-hidden rounded-lg border border-border bg-card px-6">
				<Skeleton className="my-5 h-12 w-full" />
				<Skeleton className="my-5 h-12 w-full" />
				<Skeleton className="my-5 h-12 w-full" />
			</div>
		</div>
	);
}

/** The document page, shown the moment a row is opened. */
export function DocumentPending() {
	return (
		<div aria-busy="true">
			<p className="sr-only">Loading this document</p>
			<Skeleton className="h-4 w-24" />
			<Skeleton className="mt-4 h-9 w-64" />
			<Skeleton className="mt-3 h-4 w-40" />
			<div className="mt-6 flex gap-2">
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-8 w-28" />
			</div>
			<div className="mt-10 rounded-lg border border-border bg-card px-6 py-2">
				<Skeleton className="my-5 h-12 w-full" />
				<Skeleton className="my-5 h-12 w-full" />
			</div>
			<div className="mt-10 rounded-lg border border-border bg-card px-6 py-2">
				<Skeleton className="my-5 h-12 w-full" />
				<Skeleton className="my-5 h-12 w-full" />
				<Skeleton className="my-5 h-12 w-full" />
			</div>
		</div>
	);
}

/** The shape of the signed-in pages, shown while the list or a heavy screen is loading. */
export function DeskSkeleton({ sheet = false }: { sheet?: boolean }) {
	return (
		<div className="flex min-h-svh" aria-busy="true">
			<p className="sr-only">Loading</p>
			<div className="hidden w-[248px] shrink-0 border-r border-border p-4 md:block">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="mt-4 h-9 w-full" />
				<Skeleton className="mt-6 h-8 w-full" />
				<Skeleton className="mt-2 h-8 w-full" />
				<Skeleton className="mt-2 h-8 w-full" />
			</div>
			<div className="mx-auto w-full max-w-[960px] flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-10">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="mt-3 h-4 w-56" />
				{sheet ? (
					<div className="mt-10 overflow-hidden rounded-lg border border-border bg-card px-6">
						<Skeleton className="my-5 h-12 w-full" />
						<Skeleton className="my-5 h-12 w-full" />
						<Skeleton className="my-5 h-12 w-full" />
					</div>
				) : (
					<>
						<Skeleton className="mt-10 h-16 w-full" />
						<Skeleton className="mt-3 h-16 w-full" />
						<Skeleton className="mt-3 h-16 w-full" />
						<Skeleton className="mt-3 h-16 w-full" />
					</>
				)}
			</div>
		</div>
	);
}
