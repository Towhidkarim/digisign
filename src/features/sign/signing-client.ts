import type { SubmitSignatureInput } from "#/core/contracts/index.ts";
import { sha256Hex } from "#/core/hash.ts";
import type { InviteReason } from "#/core/invite-reason.ts";
import type { Sender } from "#/features/sign/signer-status.tsx";
import type { SigningView, SubmitResult } from "#/server/domain/signing.ts";
import {
	declineSignatureFn,
	exchangeSignerTokenFn,
	getSigningContextFn,
	peekInviteFn,
	submitSignatureFn,
} from "#/server/signing.ts";

export type NotReady = Exclude<InviteReason, "ready">;

/** Why the desk cannot show a document. */
export type Problem =
	| { kind: "session"; message: string }
	| { kind: "network"; message: string }
	| { kind: "invite"; reason: NotReady; sender: Sender | null }
	| { kind: "other"; message: string };

export const CONNECTION_MESSAGE =
	"We couldn't reach DigiSign. Check your connection and try again.";

type Failure = { error: string; reason?: InviteReason | "session" };

function isFailure(value: unknown): value is Failure {
	return typeof value === "object" && value !== null && "error" in value;
}

export async function loadView(): Promise<
	{ view: SigningView } | { problem: Problem }
> {
	try {
		const result = await getSigningContextFn();
		if (isFailure(result)) {
			return {
				problem:
					result.reason === "session"
						? { kind: "session", message: result.error }
						: { kind: "other", message: result.error },
			};
		}
		return { view: result as SigningView };
	} catch {
		return { problem: { kind: "network", message: CONNECTION_MESSAGE } };
	}
}

/** The original PDF, fetched with the signer's cookie and checked against its recorded hash. */
export async function fetchSource(
	view: Extract<SigningView, { upload: unknown }>,
): Promise<{ bytes: Uint8Array } | { error: string }> {
	try {
		const response = await fetch(
			`/files/documents/${view.upload.documentId}/source`,
		);
		if (!response.ok) return { error: "The PDF could not be loaded." };
		const bytes = new Uint8Array(await response.arrayBuffer());
		if ((await sha256Hex(bytes)) !== view.upload.sha256) {
			return {
				error: "This file no longer matches the document that was prepared.",
			};
		}
		return { bytes };
	} catch {
		return { error: CONNECTION_MESSAGE };
	}
}

export type SubmitOutcome =
	| { ok: SubmitResult }
	| { network: true }
	| { error: string; reason?: InviteReason | "session" };

export async function submitSignature(
	body: SubmitSignatureInput,
): Promise<SubmitOutcome> {
	try {
		const result = await submitSignatureFn({ data: body });
		if (isFailure(result)) return result;
		const done = result as Partial<SubmitResult>;
		return {
			ok: {
				status: done.status === "completed" ? "completed" : "signed",
				// Replays of older submits carry no time; the page falls back to its own clock.
				signedAt:
					typeof done.signedAt === "number" ? done.signedAt : Date.now(),
			},
		};
	} catch {
		return { network: true };
	}
}

export type DeclineOutcome =
	| { ok: true }
	| { network: true }
	| { error: string; reason?: InviteReason | "session" };

export async function declineSignature(
	reason: string,
): Promise<DeclineOutcome> {
	try {
		const result = await declineSignatureFn({ data: { reason } });
		if (isFailure(result)) return result;
		return { ok: true };
	} catch {
		return { network: true };
	}
}

/** Re-opens a session from the link the signer arrived with. */
export async function reopenSession(
	token: string,
): Promise<{ ok: true } | { problem: Problem }> {
	try {
		const result = await exchangeSignerTokenFn({ data: { token } });
		if (!isFailure(result)) return { ok: true };
		const reason = result.reason;
		if (reason && reason !== "ready" && reason !== "session") {
			return {
				problem: { kind: "invite", reason, sender: await senderFor(token) },
			};
		}
		return { problem: { kind: "other", message: result.error } };
	} catch {
		return { problem: { kind: "network", message: CONNECTION_MESSAGE } };
	}
}

/** Who sent the document behind a link, if the server will say. */
export async function senderFor(token: string): Promise<Sender | null> {
	try {
		const peek = await peekInviteFn({ data: { token } });
		if (peek.reason === "invalid" || !("title" in peek)) return null;
		return {
			name: peek.senderName,
			email: peek.senderEmail,
			title: peek.title,
		};
	} catch {
		return null;
	}
}
