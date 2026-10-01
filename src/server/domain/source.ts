import { env } from "cloudflare:workers";
import { and, eq, gt, sql } from "drizzle-orm";

import { limits } from "#/core/limits.ts";
import { ulid } from "#/core/ulid.ts";
import { getDb } from "#/db/index.ts";
import { commitOrReplay, guardedBatch, type Statement } from "#/db/guarded-batch.ts";
import { blobIntents, documents, signerSessions, signers } from "#/db/schema/index.ts";
import { insertAudit, planAudit } from "#/server/domain/audit.ts";
import { readLastOpId } from "#/server/domain/secrets.ts";
import { AppError } from "#/server/errors.ts";

export type PutChecksum = { key: string; sha256: string };

let lastPutChecksum: PutChecksum | null = null;

export function takeLastPutChecksum(): PutChecksum | null {
	const value = lastPutChecksum;
	lastPutChecksum = null;
	return value;
}

export async function putDocumentSource(input: {
	documentId: string;
	ownerId: string;
	body: ReadableStream | null;
	contentLength: number | null;
	now?: number;
}): Promise<{ uploadStatus: "uploaded" | "rejected"; error?: string }> {
	const now = input.now ?? Date.now();
	const [document] = await getDb()
		.select()
		.from(documents)
		.where(and(eq(documents.id, input.documentId), eq(documents.ownerId, input.ownerId)))
		.limit(1);
	if (!document) throw new AppError(404, "This document was not found.");
	if (document.status !== "draft") {
		throw new AppError(409, "This document can no longer be edited.");
	}
	if (!document.sourceSha256 || document.sourceSize == null) {
		throw new AppError(422, "Record the file details before uploading the PDF.");
	}
	const key = `docs/${document.id}/${document.sourceSha256}.pdf`;
	if (
		input.contentLength == null ||
		input.contentLength !== document.sourceSize ||
		input.contentLength > limits.pdfSizeBytes ||
		!input.body
	) {
		await markUpload(
			document.id,
			document.ownerId,
			document.version,
			"rejected",
			null,
			now,
			document.sourceSha256,
		);
		return {
			uploadStatus: "rejected",
			error: input.body
				? `The upload size (${input.contentLength ?? "missing"}) does not match the prepared file (${document.sourceSize} bytes).`
				: "The PDF body was empty.",
		};
	}
	await getDb()
		.insert(blobIntents)
		.values({ r2Key: key, documentId: document.id, createdAt: now })
		.onConflictDoNothing();
	lastPutChecksum = { key, sha256: document.sourceSha256 };
	const stored = await env.STORAGE.put(key, input.body, {
		sha256: document.sourceSha256,
		httpMetadata: { contentType: "application/pdf" },
	});
	if (!stored) {
		await markUpload(
			document.id,
			document.ownerId,
			document.version,
			"rejected",
			null,
			now,
			document.sourceSha256,
		);
		return {
			uploadStatus: "rejected",
			error: "The stored file did not match the checksum recorded for this PDF.",
		};
	}
	const head = await env.STORAGE.get(key, { range: { offset: 0, length: 1024 } });
	const bytes = head ? new Uint8Array(await head.arrayBuffer()) : new Uint8Array();
	if (!pdfHeader(bytes)) {
		await env.STORAGE.delete(key);
		await markUpload(
			document.id,
			document.ownerId,
			document.version,
			"rejected",
			null,
			now,
			document.sourceSha256,
		);
		return { uploadStatus: "rejected", error: "The file is not a PDF." };
	}
	await markUpload(
		document.id,
		document.ownerId,
		document.version,
		"uploaded",
		key,
		now,
		document.sourceSha256,
	);
	return { uploadStatus: "uploaded" };
}

export async function readDocumentSource(input: {
	documentId: string;
	ownerId: string | null;
	sessionHash: string | null;
	rangeHeader: string | null;
}): Promise<Response> {
	const [document] = await getDb()
		.select()
		.from(documents)
		.where(eq(documents.id, input.documentId))
		.limit(1);
	if (!document?.sourceR2Key || !document.sourceSha256 || document.sourceSize == null) {
		return new Response("This PDF is not available.", { status: 404 });
	}
	const allowed = await canReadSource(document.ownerId, document.id, input);
	if (!allowed) return new Response("This PDF is not available.", { status: 404 });
	const range = parseRange(input.rangeHeader, document.sourceSize);
	if (range === "invalid") {
		return new Response(null, {
			status: 416,
			headers: { "content-range": `bytes */${document.sourceSize}` },
		});
	}
	const object = await env.STORAGE.get(
		document.sourceR2Key,
		range ? { range: { offset: range.offset, length: range.length } } : undefined,
	);
	if (!object) return new Response("This PDF is not available.", { status: 404 });
	const headers = new Headers({
		"content-type": "application/pdf",
		etag: document.sourceSha256,
		"cache-control": "private, no-store",
		"accept-ranges": "bytes",
	});
	if (range) {
		const end = range.offset + range.length - 1;
		headers.set("content-range", `bytes ${range.offset}-${end}/${document.sourceSize}`);
		headers.set("content-length", String(range.length));
		return new Response(object.body, { status: 206, headers });
	}
	headers.set("content-length", String(document.sourceSize));
	return new Response(object.body, { status: 200, headers });
}

async function canReadSource(
	ownerId: string,
	documentId: string,
	input: { ownerId: string | null; sessionHash: string | null },
): Promise<boolean> {
	if (input.ownerId && input.ownerId === ownerId) return true;
	if (!input.sessionHash) return false;
	const now = Date.now();
	const [row] = await getDb()
		.select({ sessionHash: signerSessions.sessionHash })
		.from(signerSessions)
		.innerJoin(signers, eq(signers.id, signerSessions.signerId))
		.where(
			and(
				eq(signerSessions.sessionHash, input.sessionHash),
				eq(signers.documentId, documentId),
				gt(signerSessions.expiresAt, now),
				gt(signerSessions.idleExpiresAt, now),
			),
		)
		.limit(1);
	return row !== undefined;
}

async function markUpload(
	documentId: string,
	ownerId: string,
	version: number,
	status: "uploaded" | "rejected",
	key: string | null,
	now: number,
	sourceSha256: string,
): Promise<void> {
	const opId = ulid();
	const effects: Statement[] = [];
	if (status === "uploaded" && key) {
		const audit = await planAudit({
			documentId,
			type: "document.source_uploaded",
			actorType: "owner",
			actorId: ownerId,
			occurredAt: now,
			payload: { sourceSha256 },
		});
		effects.push(insertAudit(audit));
	}
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(documentId),
		run: () =>
			guardedBatch({
				cas: [
					getDb()
						.update(documents)
						.set({
							uploadStatus: status,
							sourceR2Key: key,
							version: sql`${documents.version} + 1`,
							lastOpId: opId,
							updatedAt: now,
						})
						.where(
							and(
								eq(documents.id, documentId),
								eq(documents.ownerId, ownerId),
								eq(documents.status, "draft"),
								eq(documents.version, version),
							),
						),
				],
				effects,
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
}

function pdfHeader(bytes: Uint8Array): boolean {
	const text = new TextDecoder().decode(bytes);
	return text.includes("%PDF-");
}

function parseRange(
	header: string | null,
	size: number,
): { offset: number; length: number } | null | "invalid" {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return "invalid";
	const startText = match[1] ?? "";
	const endText = match[2] ?? "";
	if (startText === "" && endText === "") return "invalid";
	if (startText === "") {
		const suffix = Number(endText);
		if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
		const length = Math.min(suffix, size);
		return { offset: size - length, length };
	}
	const offset = Number(startText);
	if (!Number.isInteger(offset) || offset < 0 || offset >= size) return "invalid";
	const end = endText === "" ? size - 1 : Number(endText);
	if (!Number.isInteger(end) || end < offset) return "invalid";
	const length = Math.min(end, size - 1) - offset + 1;
	return { offset, length };
}
