import type { Mailer, MailMessage } from "#/server/mail/mailer.ts";

/** Prints each message in the process console. Used until Resend is configured. */
export const consoleMailer: Mailer = {
	async send(message: MailMessage) {
		console.log(
			[
				"----- DigiSign mail -----",
				`To: ${message.to}`,
				`Subject: ${message.subject}`,
				"",
				message.text,
				"------------------------",
			].join("\n"),
		);
		return { providerMessageId: null };
	},
};
