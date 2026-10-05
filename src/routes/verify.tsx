import { createFileRoute } from "@tanstack/react-router";

import { VerifyDesk } from "#/features/verify/verify-desk.tsx";

export const Route = createFileRoute("/verify")({
	ssr: false,
	component: () => <VerifyDesk />,
});
