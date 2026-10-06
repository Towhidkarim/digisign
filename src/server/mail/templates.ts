import type { MailMessage } from "#/server/mail/mailer.ts";

export const EMAIL_TEMPLATES = [
	"invite",
	"reminder",
	"completed",
	"declined",
	"voided",
	"expired",
] as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export type EmailData = {
	template: EmailTemplate;
	to: string;
	name: string;
	title: string;
	/** Magic link for invite and reminder. */
	url?: string;
	/** Public page for the finished document. */
	verifyUrl?: string;
	/** Who declined, for the declined notice. */
	actor?: string;
	/** Why they declined. Only the document owner's notice carries it. */
	reason?: string;
};

/** Only the invite and reminder carry a magic link. No template asks for an account. */
export function renderEmail(data: EmailData): MailMessage {
	const name = data.name.trim() || "there";
	const title = data.title;
	switch (data.template) {
		case "invite":
			return withLink({
				to: data.to,
				subject: `Please sign ${title}`,
				lead: `${name}, you have been asked to sign "${title}".`,
				url: data.url,
				action: "Review and sign",
				footer:
					"You do not need an account. Opening the link does not sign anything.",
			});
		case "reminder":
			return withLink({
				to: data.to,
				subject: `Reminder: please sign ${title}`,
				lead: `${name}, "${title}" is still waiting for your signature.`,
				url: data.url,
				action: "Review and sign",
				footer: "This link replaces the one in your earlier email.",
			});
		case "completed":
			return notice({
				to: data.to,
				subject: `${title} is fully signed`,
				lead: `Everyone has signed "${title}".`,
				url: data.verifyUrl,
				action: "Check the signed record",
			});
		case "declined":
			return notice({
				to: data.to,
				subject: `${title} was declined`,
				lead: `${data.actor?.trim() || "A signer"} declined to sign "${title}". Nobody else will be asked to sign it.`,
				detail: data.reason?.trim()
					? `Reason: ${data.reason.trim()}`
					: undefined,
			});
		case "voided":
			return notice({
				to: data.to,
				subject: `${title} was cancelled`,
				lead: `The sender cancelled "${title}". The signing link no longer works.`,
			});
		case "expired":
			return notice({
				to: data.to,
				subject: `${title} expired`,
				lead: `"${title}" was not finished in time. The signing link no longer works.`,
			});
	}
}

function withLink(input: {
	to: string;
	subject: string;
	lead: string;
	url: string | undefined;
	action: string;
	footer: string;
}): MailMessage {
	const url = input.url ?? "";
	return {
		to: input.to,
		subject: input.subject,
		text: [input.lead, "", `${input.action}: ${url}`, "", input.footer].join(
			"\n",
		),
		html: `<p>${escapeHtml(input.lead)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(input.action)}</a></p><p>${escapeHtml(input.footer)}</p>`,
	};
}

function notice(input: {
	to: string;
	subject: string;
	lead: string;
	url?: string | undefined;
	action?: string;
	detail?: string | undefined;
}): MailMessage {
	const lines = [input.lead];
	if (input.detail) lines.push("", input.detail);
	if (input.url) lines.push("", `${input.action}: ${input.url}`);
	const text = lines.join("\n");
	const detail = input.detail ? `<p>${escapeHtml(input.detail)}</p>` : "";
	const link = input.url
		? `<p><a href="${escapeHtml(input.url)}">${escapeHtml(input.action ?? input.url)}</a></p>`
		: "";
	return {
		to: input.to,
		subject: input.subject,
		text,
		html: `<p>${escapeHtml(input.lead)}</p>${detail}${link}`,
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
