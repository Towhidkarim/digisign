import { Link } from "@tanstack/react-router";

import { cn } from "#/lib/utils.ts";

/** The DigiSign mark and name. One implementation for every screen. */
export function Logo({
	to = "/",
	className,
}: {
	/** null draws the mark without a link, for screens that must not navigate away. */
	to?: "/" | "/dashboard" | null;
	className?: string;
}) {
	const classes = cn(
		"inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground no-underline hover:text-foreground",
		className,
	);
	const content = (
		<>
			<span
				aria-hidden="true"
				className="grid size-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
			>
				D
			</span>
			DigiSign
		</>
	);
	if (to === null) return <span className={classes}>{content}</span>;
	return (
		<Link to={to} className={classes}>
			{content}
		</Link>
	);
}
