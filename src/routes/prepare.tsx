import { createFileRoute, redirect } from "@tanstack/react-router";

import { PrepareDesk } from "#/features/editor/prepare-desk.tsx";
import { getSessionFn } from "#/server/session.ts";

export const Route = createFileRoute("/prepare")({
	ssr: false,
	beforeLoad: async () => {
		if (!(await getSessionFn())) throw redirect({ to: "/login" });
	},
	component: PrepareDesk,
});
