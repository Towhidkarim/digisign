import type { Mailer, MailMessage } from "#/server/mail/mailer.ts";

export function createMemoryMailer(): Mailer & {
	messages: MailMessage[];
	keys: string[];
} {
	const messages: MailMessage[] = [];
	const keys: string[] = [];
	return {
		messages,
		keys,
		async send(message, options) {
			messages.push(message);
			keys.push(options?.idempotencyKey ?? "");
			return { providerMessageId: `memory-${messages.length}` };
		},
	};
}
