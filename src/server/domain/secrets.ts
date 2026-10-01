import { eq } from "drizzle-orm";

import { sha256Hex } from "#/core/hash.ts";
import { getDb } from "#/db/index.ts";
import { documents, signers } from "#/db/schema/index.ts";

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 2 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;

export function randomSecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function secretHash(secret: string): Promise<string> {
	return sha256Hex(secret);
}

export function tokenExpiry(now: number): number {
	return now + TOKEN_TTL_MS;
}

export function sessionWindow(now: number): {
	expiresAt: number;
	idleExpiresAt: number;
} {
	return {
		expiresAt: now + SESSION_ABSOLUTE_MS,
		idleExpiresAt: now + SESSION_IDLE_MS,
	};
}

export function nextIdle(now: number, absoluteExpiresAt: number): number {
	return Math.min(now + SESSION_IDLE_MS, absoluteExpiresAt);
}

export async function readLastOpId(documentId: string): Promise<string | null> {
	const [row] = await getDb()
		.select({ lastOpId: documents.lastOpId })
		.from(documents)
		.where(eq(documents.id, documentId))
		.limit(1);
	return row?.lastOpId ?? null;
}

export async function readSignerLastOpId(signerId: string): Promise<string | null> {
	const [row] = await getDb()
		.select({ lastOpId: signers.lastOpId })
		.from(signers)
		.where(eq(signers.id, signerId))
		.limit(1);
	return row?.lastOpId ?? null;
}
