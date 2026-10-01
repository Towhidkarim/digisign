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
	publish,
	saveLayout,
	savePreparation,
	savePreparationInputSchema,
	saveSigners,
	saveSignersInputSchema,
	voidDocument,
} from "#/server/domain/documents.ts";
import { inviteNextSigner, reissueInvite } from "#/server/domain/invite.ts";
import { isAppError } from "#/server/errors.ts";

const signerIdSchema = z.strictObject({ signerId: ulidSchema });
const documentIdSchema = z.strictObject({ documentId: ulidSchema });

export const createDraftFn = createServerFn({ method: "POST" })
	.validator(createDraftInputSchema)
	.handler(async ({ data }) =>
		settle(() => createDraft({ ...data, ownerId: resolveActor().id })),
	);

export const getDraftFn = createServerFn({ method: "GET" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const loaded = await getDraft(data.documentId, resolveActor().id);
			return {
				id: loaded.document.id,
				title: loaded.document.title,
				status: loaded.document.status,
				uploadStatus: loaded.document.uploadStatus,
				layoutVersion: loaded.document.layoutVersion,
				layout: loaded.layout,
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
			await initUpload({ ownerId: resolveActor().id, upload: data });
			return { ok: true as const };
		}),
	);

export const saveSignersFn = createServerFn({ method: "POST" })
	.validator(saveSignersInputSchema)
	.handler(async ({ data }) =>
		settle(() => saveSigners({ ownerId: resolveActor().id, ...data })),
	);

export const saveLayoutFn = createServerFn({ method: "POST" })
	.validator(saveLayoutInputSchema)
	.handler(async ({ data }) =>
		settle(() => saveLayout({ ownerId: resolveActor().id, layout: data })),
	);

export const savePreparationFn = createServerFn({ method: "POST" })
	.validator(savePreparationInputSchema)
	.handler(async ({ data }) =>
		settle(() => savePreparation({ ownerId: resolveActor().id, ...data })),
	);

export const publishFn = createServerFn({ method: "POST" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(async () => {
			const published = await publish({
				ownerId: resolveActor().id,
				documentId: data.documentId,
			});
			await inviteNextSigner({
				documentId: data.documentId,
				origin: getRequestUrl().origin,
			});
			return published;
		}),
	);

export const voidDocumentFn = createServerFn({ method: "POST" })
	.validator(documentIdSchema)
	.handler(async ({ data }) =>
		settle(() => voidDocument({ ownerId: resolveActor().id, documentId: data.documentId })),
	);

export const reissueInviteFn = createServerFn({ method: "POST" })
	.validator(signerIdSchema)
	.handler(async ({ data }) =>
		settle(() =>
			reissueInvite({
				ownerId: resolveActor().id,
				signerId: data.signerId,
				origin: getRequestUrl().origin,
			}),
		),
	);

async function settle<T>(run: () => Promise<T>): Promise<T | { error: string }> {
	try {
		return await run();
	} catch (error) {
		if (isAppError(error)) return { error: error.message };
		throw error;
	}
}
