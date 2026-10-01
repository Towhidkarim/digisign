import { createFileRoute } from "@tanstack/react-router";

import { SigningDesk } from "#/features/sign/signing-desk.tsx";

export const Route = createFileRoute("/sign")({
	ssr: false,
	component: SigningDesk,
});
