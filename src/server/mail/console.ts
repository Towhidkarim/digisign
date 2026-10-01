import type { Mailer, MailMessage } from "#/server/mail/mailer.ts";

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
	},
};

let current: Mailer = consoleMailer;

export function getMailer(): Mailer {
	return current;
}

export function setMailer(mailer: Mailer): void {
	current = mailer;
}
