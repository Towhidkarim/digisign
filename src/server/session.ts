import { createServerFn } from "@tanstack/react-start";

/** Who is signed in, for route guards and the header. Never throws. */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const { readActor } = await import("#/server/actor.ts");
		const actor = await readActor();
		return actor
			? { user: { id: actor.id, name: actor.name, email: actor.email } }
			: null;
	},
);
