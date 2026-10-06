import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { exchangeSignerTokenFn } from "#/server/signing.ts";

export const Route = createFileRoute("/s/$token")({
	ssr: false,
	head: () => ({
		meta: [{ name: "referrer", content: "no-referrer" }],
	}),
	component: InviteLanding,
});

function InviteLanding() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);

	async function open() {
		setBusy(true);
		setMessage("");
		const result = await exchangeSignerTokenFn({ data: { token } });
		setBusy(false);
		if ("error" in result) {
			setMessage(result.error);
			return;
		}
		await navigate({ to: "/sign" });
	}

	return (
		<main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 px-6">
			<h1 className="text-2xl font-semibold text-primary">
				You have a document to sign
			</h1>
			<p className="text-muted-foreground">
				Opening this page does not sign anything. Continue when you are ready to
				review it.
			</p>
			<button
				type="button"
				className="w-fit rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40"
				disabled={busy}
				onClick={() => void open()}
			>
				{busy ? "Opening…" : "Review and sign"}
			</button>
			{message ? <p className="text-sm text-destructive">{message}</p> : null}
		</main>
	);
}
