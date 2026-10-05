import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";

import {
	saveLayoutInputSchema,
	ulidSchema,
	uploadInitSchema,
} from "#/core/contracts/index.ts";
import { resolveActor } from "#/server/actor.ts";
import {
	createDraft,
	createDraftInputSchema,
	getDraft,
	initUpload,
	listOwnedDocuments,
	publish,
	readOwnedDocument,
	saveLayout,
	savePreparation,
	savePreparationInputSchema,
	saveSigners,
	saveSignersInputSchema,
	voidDocument,
} from "#/server/domain/documents.ts";
import { reissueInvite } from "#/server/domain/invite.ts";
import { publishOutboxQuietly } from "#/server/engine/outbox.ts";
import { isAppError } from "#/server/errors.ts";

function draftUpload(document: {
	id: string;
	status: string;
	sourceSha256: string | null;
	sourceSize: number | null;
	pageCount: number;
	geometryJson: string | null;
}) {
	if (
		document.status !== "draft" ||
		!document.geometryJson ||
		!document.sourceSha256 ||
		document.sourceSize == null
	) {
		return null;
	}
	try {
		const parsed = uploadInitSchema.safeParse({
			documentId: document.id,
			sha256: document.sourceSha256,
			sizeBytes: document.sourceSize,
			pageCount: document.pageCount,
			geometry: JSON.parse(document.geometryJson) as unknown,
		});
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

const signerIdSchema = z.strictObject({ signerId: ulidSchema });
const documentIdSchema = z.strictObject({ documentId: ulidSchema });

export const listDocumentsFn = createServerFn({ method: "GET" }).handler(
	async () => settle(async () => listOwnedDocuments((await resolveActor()).id)),
);

export const getDocumentFn = createServerFn({ method: "GET" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(async () =>
			readOwnedDocument((await resolveActor()).id, data.documentId),
		),
	);

export const createDraftFn = createServerFn({ method: "POST" })
	.validator(createDraftInputSchema)
	.handler(async ({ data }) =>
		settle(async () =>
			createDraft({ ...data, ownerId: (await resolveActor()).id }),
		),
	);

export const getDraftFn = createServerFn({ method: "GET" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const loaded = await getDraft(data.documentId, (await resolveActor()).id);
			return {
				id: loaded.document.id,
				title: loaded.document.title,
				status: loaded.document.status,
				uploadStatus: loaded.document.uploadStatus,
				layoutVersion: loaded.document.layoutVersion,
				layout: loaded.layout,
				upload: draftUpload(loaded.document),
				signers: loaded.signers.map((signer) => ({
					id: signer.id,
					name: signer.name,
					email: signer.email,
					status: signer.status,
					signingOrder: signer.signingOrder,
				})),
			};
		}),
	);

export const initUploadFn = createServerFn({ method: "POST" })
	.validator(uploadInitSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			await initUpload({ ownerId: (await resolveActor()).id, upload: data });
			return { ok: true as const };
		}),
	);

export const saveSignersFn = createServerFn({ method: "POST" })
	.validator(saveSignersInputSchema)
	.handler(async ({ data }) =>
		settle(async () =>
			saveSigners({ ownerId: (await resolveActor()).id, ...data }),
		),
	);

export const saveLayoutFn = createServerFn({ method: "POST" })
	.validator(saveLayoutInputSchema)
	.handler(async ({ data }) =>
		settle(async () =>
			saveLayout({ ownerId: (await resolveActor()).id, layout: data }),
		),
	);

export const savePreparationFn = createServerFn({ method: "POST" })
	.validator(savePreparationInputSchema)
	.handler(async ({ data }) =>
		settle(async () =>
			savePreparation({ ownerId: (await resolveActor()).id, ...data }),
		),
	);

export const publishFn = createServerFn({ method: "POST" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const published = await publish({
				ownerId: (await resolveActor()).id,
				documentId: data.documentId,
				origin: getRequestUrl().origin,
			});
			await publishOutboxQuietly(data.documentId);
			return published;
		}),
	);

export const voidDocumentFn = createServerFn({ method: "POST" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const voided = await voidDocument({
				ownerId: (await resolveActor()).id,
				documentId: data.documentId,
			});
			await publishOutboxQuietly(data.documentId);
			return voided;
		}),
	);

export const reissueInviteFn = createServerFn({ method: "POST" })
	.validator(signerIdSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const reissued = await reissueInvite({
				ownerId: (await resolveActor()).id,
				signerId: data.signerId,
				origin: getRequestUrl().origin,
			});
			await publishOutboxQuietly(reissued.documentId);
			return {
				ok: true as const,
				url: `${getRequestUrl().origin}/s/${reissued.token}`,
			};
		}),
	);

async function settle<T>(
	run: () => Promise<T>,
): Promise<T | { error: string }> {
	try {
		return await run();
	} catch (error) {
		if (isAppError(error)) return { error: error.message };
		throw error;
	}
}
