import { env } from "cloudflare:workers";

import { consoleMailer } from "#/server/mail/console.ts";
import type { Mailer } from "#/server/mail/mailer.ts";
import { createResendMailer } from "#/server/mail/resend.ts";

let override: Mailer | null = null;

/** Tests swap the adapter here. */
export function setMailer(mailer: Mailer | null): void {
	override = mailer;
}

/**
 * Resend when both RESEND_API_KEY and MAIL_FROM are set. Otherwise the console,
 * which prints the magic link in the terminal that runs the app.
 */
export function getMailer(): Mailer {
	if (override) return override;
	if (env.RESEND_API_KEY && env.MAIL_FROM) {
		return createResendMailer({
			apiKey: env.RESEND_API_KEY,
			from: env.MAIL_FROM,
		});
	}
	return consoleMailer;
}

/** The public origin used in links when no request is available (queue and cron). */
export function appOrigin(): string {
	return (env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}
