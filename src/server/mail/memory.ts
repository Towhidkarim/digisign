import type { Mailer, MailMessage } from "#/server/mail/mailer.ts";

export function createMemoryMailer(): Mailer & { messages: MailMessage[] } {
	const messages: MailMessage[] = [];
	return {
		messages,
		async send(message) {
			messages.push(message);
		},
	};
}
