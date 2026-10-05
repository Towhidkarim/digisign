import { Link } from "@tanstack/react-router";

export function SiteHeader({
	home,
	children,
}: {
	home: "/" | "/dashboard";
	children: React.ReactNode;
}) {
	return (
		<header className="flex items-center justify-between gap-4 pb-4">
			<Link
				to={home}
				className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground no-underline hover:text-foreground"
			>
				<span
					aria-hidden="true"
					className="grid size-8 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground"
				>
					D
				</span>
				DigiSign
			</Link>
			<nav aria-label="Account" className="flex items-center gap-5 text-sm font-medium">
				{children}
			</nav>
		</header>
	);
}
