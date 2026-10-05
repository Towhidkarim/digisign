import { createFileRoute } from "@tanstack/react-router";

import { VerifyDesk } from "#/features/verify/verify-desk.tsx";

export const Route = createFileRoute("/v/$documentId")({
	ssr: false,
	component: Prefilled,
});

function Prefilled() {
	const { documentId } = Route.useParams();
	return <VerifyDesk initialId={documentId} />;
}
