import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { getDb } from "#/db/index.ts";
import { account, session, user, verification } from "#/db/schema/index.ts";
import { hashPassword, verifyPassword } from "#/server/password.ts";

/** Creators only. Built per request so the D1 binding is read from the current environment. */
export function getAuth() {
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(getDb(), {
			provider: "sqlite",
			schema: { user, session, account, verification },
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			password: { hash: hashPassword, verify: verifyPassword },
		},
		advanced: {
			useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
		},
		plugins: [tanstackStartCookies()],
	});
}
