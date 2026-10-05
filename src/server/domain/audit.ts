import { desc, eq } from "drizzle-orm";

import { canonicalJson } from "#/core/canonical-json.ts";
import { sha256Hex } from "#/core/hash.ts";
import { ulid } from "#/core/ulid.ts";
import { getDb } from "#/db/index.ts";
import { auditEvents } from "#/db/schema/index.ts";

export type AuditDraft = {
	documentId: string;
	seq: number;
	id: string;
	type: string;
	actorType: string;
	actorId: string;
	occurredAt: number;
	payloadJson: string;
	prevHash: string;
	hash: string;
};

export async function genesisHash(documentId: string): Promise<string> {
	return sha256Hex(`digisign:genesis:${documentId}`);
}

export async function readAuditHead(
	documentId: string,
): Promise<{ seq: number; hash: string } | null> {
	const [row] = await getDb()
		.select({ seq: auditEvents.seq, hash: auditEvents.hash })
		.from(auditEvents)
		.where(eq(auditEvents.documentId, documentId))
		.orderBy(desc(auditEvents.seq))
		.limit(1);
	return row ?? null;
}

export async function planAudit(input: {
	documentId: string;
	type: string;
	actorType: string;
	actorId: string;
	occurredAt: number;
	payload: Record<string, unknown>;
	prev?: { seq: number; hash: string } | null;
}): Promise<AuditDraft> {
	const prev =
		input.prev === undefined
			? await readAuditHead(input.documentId)
			: input.prev;
	const seq = (prev?.seq ?? 0) + 1;
	const prevHash = prev?.hash ?? (await genesisHash(input.documentId));
	const payloadJson = canonicalJson(input.payload);
	const draft: Omit<AuditDraft, "hash"> = {
		documentId: input.documentId,
		seq,
		id: ulid(),
		type: input.type,
		actorType: input.actorType,
		actorId: input.actorId,
		occurredAt: input.occurredAt,
		payloadJson,
		prevHash,
	};
	const hash = await sha256Hex(
		canonicalJson({
			documentId: draft.documentId,
			seq: draft.seq,
			type: draft.type,
			actorType: draft.actorType,
			actorId: draft.actorId,
			occurredAt: draft.occurredAt,
			payload: input.payload,
			prevHash: draft.prevHash,
		}),
	);
	return { ...draft, hash };
}

export function insertAudit(draft: AuditDraft) {
	return getDb().insert(auditEvents).values({
		documentId: draft.documentId,
		seq: draft.seq,
		id: draft.id,
		type: draft.type,
		actorType: draft.actorType,
		actorId: draft.actorId,
		occurredAt: draft.occurredAt,
		payloadJson: draft.payloadJson,
		prevHash: draft.prevHash,
		hash: draft.hash,
	});
}
