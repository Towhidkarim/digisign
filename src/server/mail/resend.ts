import {
	MailError,
	type Mailer,
	type MailMessage,
	type MailSendOptions,
} from "#/server/mail/mailer.ts";

const ENDPOINT = "https://api.resend.com/emails";

/** 429, 5xx, and a concurrent duplicate are worth retrying. Other 4xx will fail again. */
export function classifyResendStatus(
	status: number,
): "transient" | "permanent" {
	if (status === 408 || status === 409 || status === 425 || status === 429) {
		return "transient";
	}
	if (status >= 500) return "transient";
	return "permanent";
}

export function createResendMailer(config: {
	apiKey: string;
	from: string;
	fetcher?: typeof fetch;
}): Mailer {
	const fetcher = config.fetcher ?? fetch;
	return {
		async send(message: MailMessage, options?: MailSendOptions) {
			const headers: Record<string, string> = {
				authorization: `Bearer ${config.apiKey}`,
				"content-type": "application/json",
			};
			if (options?.idempotencyKey)
				headers["idempotency-key"] = options.idempotencyKey;
			let response: Response;
			try {
				response = await fetcher(ENDPOINT, {
					method: "POST",
					headers,
					body: JSON.stringify({
						from: config.from,
						to: [message.to],
						subject: message.subject,
						html: message.html,
						text: message.text,
					}),
				});
			} catch (error) {
				throw new MailError(
					"transient",
					error instanceof Error
						? error.message
						: "The mail provider could not be reached.",
				);
			}
			if (!response.ok) {
				const detail = await response.text().catch(() => "");
				throw new MailError(
					classifyResendStatus(response.status),
					`Resend answered ${response.status}. ${detail.slice(0, 200)}`.trim(),
				);
			}
			const body = (await response.json().catch(() => null)) as {
				id?: string;
			} | null;
			return { providerMessageId: body?.id ?? null };
		},
	};
}
