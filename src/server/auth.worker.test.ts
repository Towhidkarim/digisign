import { beforeAll, describe, expect, it } from "vitest";

import { ulid } from "#/core/ulid.ts";
import { getAuth } from "#/lib/auth.ts";
import { readActor, resolveActor } from "#/server/actor.ts";
import {
	getDraft,
	listOwnedDocuments,
	readOwnedDocument,
} from "#/server/domain/documents.ts";
import { createReadGrant } from "#/server/domain/grants.ts";
import { inviteNextSigner } from "#/server/domain/invite.ts";
import { secretHash } from "#/server/domain/secrets.ts";
import { exchangeSignerToken } from "#/server/domain/signing.ts";
import {
	putDocumentSource,
	readDocumentSource,
} from "#/server/domain/source.ts";
import { AppError } from "#/server/errors.ts";
import { crossSiteRejection } from "#/server/security.ts";
import {
	buildPublished,
	DEV_OWNER_ID,
	migrate,
	ORIGIN,
} from "#/server/test-support.ts";

const BASE = "http://localhost:3000";

beforeAll(migrate);

async function post(
	path: string,
	body: unknown,
	cookie?: string,
): Promise<Response> {
	return getAuth().handler(
		new Request(`${BASE}/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: BASE,
				...(cookie ? { cookie } : {}),
			},
			body: JSON.stringify(body),
		}),
	);
}

function cookieFrom(response: Response): string {
	return response.headers
		.getSetCookie()
		.map((line) => line.split(";")[0])
		.join("; ");
}

async function account(label: string) {
	const email = `${label}-${ulid().toLowerCase()}@example.com`;
	const response = await post("/sign-up/email", {
		name: label,
		email,
		password: "correct horse battery",
	});
	expect(response.status).toBe(200);
	const body = (await response.json()) as { user: { id: string } };
	return { email, id: body.user.id, cookie: cookieFrom(response), response };
}

describe("phase 4 auth", () => {
	it("R-4.2 a signed-in request resolves to its creator, an anonymous one gets 401", async () => {
		const creator = await account("ada");
		const actor = await resolveActor(new Headers({ cookie: creator.cookie }));
		expect(actor.id).toBe(creator.id);
		expect(actor.email).toBe(creator.email);
		expect(await readActor(new Headers())).toBeNull();
		await expect(resolveActor(new Headers())).rejects.toMatchObject({
			status: 401,
		});
		await expect(
			resolveActor(
				new Headers({ cookie: "better-auth.session_token=forged.value" }),
			),
		).rejects.toBeInstanceOf(AppError);
	});

	it("R-4.2 the session cookie is HttpOnly and SameSite=Lax", async () => {
		const creator = await account("cookie");
		const line = creator.response.headers
			.getSetCookie()
			.find((item) => item.includes("session_token"));
		expect(line).toBeDefined();
		expect(line).toMatch(/HttpOnly/i);
		expect(line).toMatch(/SameSite=Lax/i);
	});

	it("R-4.3 a wrong password and an unknown email look the same", async () => {
		const creator = await account("grace");
		const wrongPassword = await post("/sign-in/email", {
			email: creator.email,
			password: "not the password",
		});
		const unknown = await post("/sign-in/email", {
			email: `nobody-${ulid().toLowerCase()}@example.com`,
			password: "not the password",
		});
		expect(wrongPassword.status).toBe(unknown.status);
		expect(wrongPassword.status).toBeGreaterThanOrEqual(400);
		expect(await wrongPassword.json()).toEqual(await unknown.json());
		const right = await post("/sign-in/email", {
			email: creator.email,
			password: "correct horse battery",
		});
		expect(right.status).toBe(200);
	});

	it("R-4.4 logs the time for sign-in and session lookup", async () => {
		const creator = await account("timing");
		const start = performance.now();
		await post("/sign-in/email", {
			email: creator.email,
			password: "correct horse battery",
		});
		const signIn = performance.now() - start;
		const lookup = performance.now();
		await readActor(new Headers({ cookie: creator.cookie }));
		console.info(
			`sign-in ${signIn.toFixed(1)} ms; session lookup ${(performance.now() - lookup).toFixed(1)} ms (wall clock, not CPU)`,
		);
	});

	it("R-4.1 who can read or write a document", async () => {
		const built = await buildPublished(1);
		const first = built.signers[0];
		if (!first) throw new Error("No signer.");
		const stranger = await account("stranger");
		const read = (input: {
			ownerId?: string | null;
			sessionHash?: string | null;
			grant?: string | null;
		}) =>
			readDocumentSource({
				documentId: built.documentId,
				ownerId: input.ownerId ?? null,
				sessionHash: input.sessionHash ?? null,
				rangeHeader: null,
				grant: input.grant ?? null,
			});

		expect((await read({})).status).toBe(404);
		expect((await read({ ownerId: stranger.id })).status).toBe(404);
		expect((await read({ ownerId: DEV_OWNER_ID })).status).toBe(200);

		await expect(
			getDraft(built.documentId, stranger.id),
		).rejects.toBeInstanceOf(AppError);
		await expect(
			putDocumentSource({
				documentId: built.documentId,
				ownerId: stranger.id,
				body: null,
				contentLength: null,
			}),
		).rejects.toMatchObject({ status: 404 });

		const invited = await inviteNextSigner({
			documentId: built.documentId,
			origin: ORIGIN,
		});
		if (!invited.invited) throw new Error("The invite was not created.");
		const session = await exchangeSignerToken({ token: invited.token });
		expect(
			(await read({ sessionHash: await secretHash(session.sessionId) })).status,
		).toBe(200);
		expect(
			(await read({ sessionHash: await secretHash("another-session") })).status,
		).toBe(404);

		const { grant } = await createReadGrant(built.documentId, Date.now());
		expect((await read({ grant })).status).toBe(404);
	});

	it("a creator's list includes their document and leaves out another owner's", async () => {
		const built = await buildPublished(1);
		const own = await listOwnedDocuments(DEV_OWNER_ID);
		const found = own.find((document) => document.id === built.documentId);
		expect(found?.signers).toBe(1);
		expect(found?.signed).toBe(0);
		expect(found?.waitingOn).toBeNull();
		const detail = await readOwnedDocument(DEV_OWNER_ID, built.documentId);
		expect(detail.signers).toHaveLength(1);
		await expect(
			readOwnedDocument("01OTHEROWNER00000000000000", built.documentId),
		).rejects.toMatchObject({ status: 404 });
		const other = await listOwnedDocuments("01OTHEROWNER00000000000000");
		expect(other.some((document) => document.id === built.documentId)).toBe(
			false,
		);
	});

	it("R-4.1 cross-site writes are refused and same-site ones pass", () => {
		const make = (headers: Record<string, string>, method = "POST") =>
			new Request(`${BASE}/_serverFn/x`, { method, headers });
		expect(
			crossSiteRejection(make({ origin: "https://evil.example" }), BASE)
				?.status,
		).toBe(403);
		expect(
			crossSiteRejection(make({ "sec-fetch-site": "cross-site" }), BASE)
				?.status,
		).toBe(403);
		expect(crossSiteRejection(make({ origin: BASE }), BASE)).toBeNull();
		expect(
			crossSiteRejection(make({ origin: "https://evil.example" }, "GET"), BASE),
		).toBeNull();
	});
});
