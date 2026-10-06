import { Link } from "@tanstack/react-router";

import { cn } from "#/lib/utils.ts";

/** The DigiSign mark and name. One implementation for every screen. */
export function Logo({
	to = "/",
	className,
}: {
	to?: "/" | "/dashboard";
	className?: string;
}) {
	return (
		<Link
			to={to}
			className={cn(
				"inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground no-underline hover:text-foreground",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className="grid size-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
			>
				D
			</span>
			DigiSign
		</Link>
	);
}
