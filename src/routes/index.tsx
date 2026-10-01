import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="sheet">
			<p className="wordmark">DigiSign</p>
			<h1 className="doc-title">A quiet desk for signatures.</h1>
			<p>Prepare a document and collect signatures in order.</p>
			<div className="sheet-actions">
				<Button asChild>
					<Link to="/prepare">Prepare a document</Link>
				</Button>
				<Link to="/dev/foundations">Check local services</Link>
			</div>
		</main>
	);
}
