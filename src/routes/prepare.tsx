import { createFileRoute } from "@tanstack/react-router";

import { PrepareDesk } from "#/features/editor/prepare-desk.tsx";

export const Route = createFileRoute("/prepare")({
	ssr: false,
	component: PrepareDesk,
});
