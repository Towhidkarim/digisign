import { env } from "cloudflare:workers";

/** A read grant lets a public verifier fetch one completed document's original PDF for ten minutes. */
export const GRANT_TTL_MS = 10 * 60 * 1000;

let fallbackSecret: string | null = null;

function grantSecret(): string {
	if (env.MANIFEST_SIGNING_KEY) return env.MANIFEST_SIGNING_KEY;
	fallbackSecret ??= crypto.randomUUID() + crypto.randomUUID();
	return fallbackSecret;
}

async function mac(documentId: string, expiresAt: number): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(`digisign:read-grant:${grantSecret()}`),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${documentId}.${expiresAt}`),
	);
	let binary = "";
	for (const byte of new Uint8Array(signature))
		binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

export async function createReadGrant(
	documentId: string,
	now: number,
): Promise<{ grant: string; expiresAt: number }> {
	const expiresAt = now + GRANT_TTL_MS;
	return {
		grant: `${expiresAt}.${await mac(documentId, expiresAt)}`,
		expiresAt,
	};
}

export async function checkReadGrant(
	documentId: string,
	grant: string | null,
	now: number,
): Promise<boolean> {
	if (!grant) return false;
	const [expiry, tag] = grant.split(".");
	const expiresAt = Number(expiry);
	if (!tag || !Number.isInteger(expiresAt) || expiresAt <= now) return false;
	const expected = await mac(documentId, expiresAt);
	if (expected.length !== tag.length) return false;
	let diff = 0;
	for (let index = 0; index < expected.length; index += 1) {
		diff |= expected.charCodeAt(index) ^ tag.charCodeAt(index);
	}
	return diff === 0;
}
