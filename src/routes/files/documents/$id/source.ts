import { createFileRoute } from "@tanstack/react-router";

import { readActor, resolveActor } from "#/server/actor.ts";
import { secretHash } from "#/server/domain/secrets.ts";
import { SIGNER_COOKIE } from "#/server/domain/signing.ts";
import {
	putDocumentSource,
	readDocumentSource,
} from "#/server/domain/source.ts";
import { isAppError } from "#/server/errors.ts";

export const Route = createFileRoute("/files/documents/$id/source")({
	server: {
		handlers: {
			PUT: async ({ request, params }) => {
				try {
					const length = request.headers.get("content-length");
					const result = await putDocumentSource({
						documentId: params.id,
						ownerId: (await resolveActor(request.headers)).id,
						body: request.body,
						contentLength: length == null ? null : Number(length),
					});
					return Response.json(
						result.uploadStatus === "uploaded"
							? result
							: { error: result.error ?? "The PDF could not be stored." },
						{ status: result.uploadStatus === "uploaded" ? 200 : 422 },
					);
				} catch (error) {
					return errorResponse(error);
				}
			},
			GET: async ({ request, params }) => {
				try {
					const raw = cookieValue(request.headers.get("cookie"), SIGNER_COOKIE);
					return await readDocumentSource({
						documentId: params.id,
						ownerId: (await readActor(request.headers))?.id ?? null,
						sessionHash: raw ? await secretHash(raw) : null,
						rangeHeader: request.headers.get("range"),
						grant: new URL(request.url).searchParams.get("grant"),
					});
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});

function cookieValue(header: string | null, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return decodeURIComponent(rest.join("="));
	}
	return null;
}

function errorResponse(error: unknown): Response {
	if (isAppError(error)) {
		return Response.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof Error && error.message.includes("over")) {
		return Response.json({ error: error.message }, { status: 413 });
	}
	return Response.json(
		{ error: "The file could not be transferred." },
		{ status: 500 },
	);
}
