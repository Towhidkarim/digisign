import { createFileRoute } from "@tanstack/react-router";

import { VerifyPending } from "#/features/verify/verify-pending.tsx";
import { lazyDesk } from "#/lib/lazy-desk.tsx";

const VerifyDesk = lazyDesk<{ initialId?: string }>(
	import.meta.env.SSR
		? null
		: () =>
				import("#/features/verify/verify-desk.tsx").then((module) => ({
					default: module.VerifyDesk,
				})),
	<VerifyPending />,
);

export const Route = createFileRoute("/verify")({
	ssr: false,
	component: () => <VerifyDesk />,
});
