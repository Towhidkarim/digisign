import {
	Ban,
	CircleCheck,
	Clock,
	Link2Off,
	type LucideIcon,
	OctagonX,
	TimerOff,
	TriangleAlert,
	WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import { Logo } from "#/components/logo.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { InviteReason } from "#/core/invite-reason.ts";
import { cn } from "#/lib/utils.ts";

export type StatusTone = "info" | "warning" | "neutral";

const TONE: Record<StatusTone, string> = {
	info: "bg-brand-bg text-brand-fg",
	warning: "bg-warning-bg text-warning-fg",
	neutral: "bg-neutral-bg text-neutral-fg",
};

/** The frame every signer page shares: a header with the logo (no link) and a centred column. */
export function SignerPage({
	children,
	wide = false,
}: {
	children: ReactNode;
	wide?: boolean;
}) {
	return (
		<div className="min-h-svh bg-background">
			<header className="px-4 py-4 sm:px-6">
				<Logo to={null} />
			</header>
			<main
				className={cn(
					"mx-auto w-full px-4 pt-6 pb-16 sm:pt-12",
					wide ? "max-w-[560px]" : "max-w-[480px]",
				)}
			>
				{children}
			</main>
		</div>
	);
}

/** One card for every case where the signer cannot go on. */
export function SignerStatus({
	tone,
	icon: Icon,
	title,
	text,
	note,
	action,
	help,
}: {
	tone: StatusTone;
	icon: LucideIcon;
	title: string;
	text: string;
	note?: string;
	action?: ReactNode;
	help?: string;
}) {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		heading.current?.focus();
	}, []);
	return (
		<>
			<section
				role="alert"
				className="rounded-xl border border-border bg-card p-5 text-center sm:p-6"
			>
				<span
					className={cn(
						"mx-auto grid size-14 place-items-center rounded-full",
						TONE[tone],
					)}
				>
					<Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
				</span>
				<h1
					ref={heading}
					tabIndex={-1}
					className="mt-4 text-heading font-semibold text-foreground outline-none"
				>
					{title}
				</h1>
				<p className="mt-2 text-muted-foreground">{text}</p>
				{note ? (
					<p className="mt-4 rounded-lg bg-muted p-3 text-left text-sm text-muted-foreground">
						{note}
					</p>
				) : null}
				{action ? (
					<div className="mt-5 flex flex-col gap-2">{action}</div>
				) : null}
			</section>
			{help ? (
				<p className="mt-4 text-center text-small text-muted-foreground">
					{help}
				</p>
			) : null}
		</>
	);
}

/** Who sent the document. Known only when the server told us. */
export type Sender = { name: string; email: string; title: string };

function helpFor(sender: Sender | null): string | undefined {
	if (!sender?.name) return undefined;
	return `Questions about this document? Contact ${sender.name} at ${sender.email}.`;
}

/** The screen for each reason an invite link cannot be used. */
export function InviteReasonScreen({
	reason,
	sender,
}: {
	reason: Exclude<InviteReason, "ready">;
	sender: Sender | null;
}) {
	const name = sender?.name || "the sender";
	const title = sender?.title || "this document";
	const help = helpFor(sender);
	switch (reason) {
		case "replaced":
			return (
				<SignerStatus
					tone="neutral"
					icon={Link2Off}
					title="This link has been replaced"
					text={`${name} sent you a newer link for ${title}. Use the most recent email from DigiSign.`}
					help={help}
				/>
			);
		case "expired":
			return (
				<SignerStatus
					tone="neutral"
					icon={TimerOff}
					title="This link has expired"
					text={`Signing links stop working after a while. Ask ${name} to send you a new one.`}
					action={
						sender?.email ? (
							<Button asChild className="h-12 w-full text-base">
								<a
									href={`mailto:${sender.email}?subject=${encodeURIComponent(`New signing link for ${title}`)}`}
								>
									Email {name}
								</a>
							</Button>
						) : undefined
					}
					help="Nothing was signed."
				/>
			);
		case "cancelled":
			return (
				<SignerStatus
					tone="neutral"
					icon={Ban}
					title="This document was cancelled"
					text={`${name} cancelled ${title}. Nothing more is needed from you.`}
					help={help}
				/>
			);
		case "stopped":
			return (
				<SignerStatus
					tone="neutral"
					icon={OctagonX}
					title="Signing has stopped"
					text={`Someone declined to sign ${title}, so it is no longer waiting for signatures. Nothing more is needed from you.`}
					help={help}
				/>
			);
		case "signed":
			return (
				<SignerStatus
					tone="neutral"
					icon={CircleCheck}
					title="You've already signed"
					text="Nothing more is needed from you."
					help={help}
				/>
			);
		case "invalid":
			return (
				<SignerStatus
					tone="neutral"
					icon={Link2Off}
					title="This link doesn't look right"
					text="Check that you copied the whole link from the email, or ask the sender for a new one."
				/>
			);
	}
}

export function SessionTimedOutScreen({
	onContinue,
	busy,
	error,
	sender,
}: {
	onContinue: () => void;
	busy: boolean;
	error: string;
	sender: Sender | null;
}) {
	return (
		<SignerStatus
			tone="info"
			icon={Clock}
			title="Your session timed out"
			text="For your security, we sign you out after 30 minutes of inactivity. Nothing was signed."
			note="Your entries on this page are kept on this device, so you can pick up where you left off."
			action={
				<>
					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}
					<Button
						type="button"
						className="h-12 w-full text-base"
						aria-disabled={busy}
						onClick={() => {
							if (!busy) onContinue();
						}}
					>
						Continue signing
					</Button>
				</>
			}
			help={helpFor(sender)}
		/>
	);
}

export function ConnectionLostScreen({
	onRetry,
	busy,
	sender,
}: {
	onRetry: () => void;
	busy: boolean;
	sender: Sender | null;
}) {
	return (
		<SignerStatus
			tone="warning"
			icon={WifiOff}
			title="We couldn't record your signature"
			text="Your connection dropped before we could save it. Nothing was lost, and you won't sign twice if you try again."
			action={
				<Button
					type="button"
					className="h-12 w-full text-base"
					aria-disabled={busy}
					onClick={() => {
						if (!busy) onRetry();
					}}
				>
					{busy ? "Trying again…" : "Try again"}
				</Button>
			}
			help={
				sender?.name
					? `Still not working? Check your connection, or contact ${sender.name} at ${sender.email}.`
					: "Still not working? Check your connection and try again."
			}
		/>
	);
}

/** For a session that cannot be recovered and no link to start again from. */
export function GenericProblemScreen({ message }: { message: string }) {
	return (
		<SignerStatus
			tone="warning"
			icon={TriangleAlert}
			title="Something went wrong"
			text={message}
		/>
	);
}
