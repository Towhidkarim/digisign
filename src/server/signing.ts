import { createServerFn } from "@tanstack/react-start";
import {
	getCookie,
	getRequest,
	getRequestIP,
	getRequestUrl,
	setCookie,
} from "@tanstack/react-start/server";
import { z } from "zod";

import { submitSignatureInputSchema } from "#/core/contracts/index.ts";
import {
	declineSignature,
	exchangeSignerToken,
	getSigningContext,
	SIGNER_COOKIE,
	submitSignature,
} from "#/server/domain/signing.ts";
import { isAppError } from "#/server/errors.ts";

const tokenSchema = z.strictObject({ token: z.string().min(20).max(200) });
const declineSchema = z.strictObject({ reason: z.string().max(500) });

export const exchangeSignerTokenFn = createServerFn({ method: "POST" })
	.validator(tokenSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const exchanged = await exchangeSignerToken({ token: data.token });
			const secure = getRequestUrl().protocol === "https:";
			setCookie(SIGNER_COOKIE, exchanged.sessionId, {
				httpOnly: true,
				secure,
				sameSite: "lax",
				path: "/",
				maxAge: 2 * 60 * 60,
			});
			return { ok: true as const };
		}),
	);

export const getSigningContextFn = createServerFn({ method: "GET" }).handler(async () =>
	settle(async () => {
		const sessionId = getCookie(SIGNER_COOKIE);
		if (!sessionId) throw new Error("Open the invite link to sign this document.");
		return getSigningContext({ sessionId });
	}),
);

export const submitSignatureFn = createServerFn({ method: "POST" })
	.validator(submitSignatureInputSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const sessionId = getCookie(SIGNER_COOKIE);
			if (!sessionId) throw new Error("Open the invite link to sign this document.");
			const request = getRequest();
			return submitSignature({
				sessionId,
				body: data,
				ip: getRequestIP({ xForwardedFor: true }) ?? "unknown",
				userAgent: request.headers.get("user-agent") ?? "",
				origin: getRequestUrl().origin,
			});
		}),
	);

export const declineSignatureFn = createServerFn({ method: "POST" })
	.validator(declineSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const sessionId = getCookie(SIGNER_COOKIE);
			if (!sessionId) throw new Error("Open the invite link to sign this document.");
			return declineSignature({ sessionId, reason: data.reason });
		}),
	);

async function settle<T>(run: () => Promise<T>): Promise<T | { error: string }> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Open the invite")) {
			return { error: error.message };
		}
		if (isAppError(error)) return { error: error.message };
		throw error;
	}
}
