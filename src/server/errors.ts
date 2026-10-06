import {
	INVITE_REASON_MESSAGE,
	type InviteReason,
} from "#/core/invite-reason.ts";

export class AppError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "AppError";
		this.status = status;
	}
}

export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}

/** A signer link that cannot be used. `reason` tells the page which screen to show. */
export class InviteLinkError extends AppError {
	readonly reason: InviteReason;

	constructor(reason: InviteReason) {
		super(401, INVITE_REASON_MESSAGE[reason]);
		this.name = "InviteLinkError";
		this.reason = reason;
	}
}

export function isInviteLinkError(error: unknown): error is InviteLinkError {
	return error instanceof InviteLinkError;
}
