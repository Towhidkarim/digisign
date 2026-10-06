import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, LoaderCircle, Lock, PenLine, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
/** Where the token waits so the signing page can re-open a timed-out session. Never logged. */
import { INVITE_TOKEN_KEY as TOKEN_KEY } from "#/features/sign/desk-model.ts";
import {
	InviteReasonScreen,
	SignerPage,
} from "#/features/sign/signer-status.tsx";
import { exchangeSignerTokenFn, peekInviteFn } from "#/server/signing.ts";

export const Route = createFileRoute("/s/$token")({
	ssr: false,
	head: () => ({
		meta: [{ name: "referrer", content: "no-referrer" }],
	}),
	component: InviteLanding,
});

type Peek = Awaited<ReturnType<typeof peekInviteFn>>;
type Ready = Extract<Peek, { reason: "ready" }>;

const CONNECTION =
	"We couldn't reach DigiSign. Check your connection and try again.";

const DATE = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZoneName: "short",
});

function InviteLanding() {
	const { token } = Route.useParams();
	const [peek, setPeek] = useState<Peek | null>(null);
	const [failed, setFailed] = useState(false);

	const load = useCallback(async () => {
		setFailed(false);
		setPeek(null);
		try {
			setPeek(await peekInviteFn({ data: { token } }));
		} catch {
			setFailed(true);
		}
	}, [token]);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<SignerPage>
			{failed ? (
				<Alert variant="destructive" role="alert">
					<AlertDescription className="mt-0">
						<p>{CONNECTION}</p>
						<Button
							type="button"
							variant="outline"
							className="mt-3 bg-card text-foreground max-sm:min-h-11"
							onClick={() => void load()}
						>
							Try again
						</Button>
					</AlertDescription>
				</Alert>
			) : peek === null ? (
				<InviteSkeleton />
			) : peek.reason === "ready" ? (
				<ReadyInvite token={token} peek={peek} />
			) : (
				<NotReady peek={peek} />
			)}
		</SignerPage>
	);
}

function InviteSkeleton() {
	return (
		<div aria-busy="true">
			<p className="sr-only">Loading</p>
			<Skeleton className="h-4 w-48" />
			<Skeleton className="mt-3 h-9 w-72 max-w-full" />
			<Skeleton className="mt-6 h-56 w-full rounded-xl" />
			<Skeleton className="mt-6 h-12 w-full rounded-lg" />
		</div>
	);
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const letters = [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ""];
	return letters.join("").toUpperCase() || "?";
}

function ReadyInvite({ token, peek }: { token: string; peek: Ready }) {
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [stopped, setStopped] = useState<Peek | null>(null);

	async function open() {
		if (busy) return;
		setBusy(true);
		setMessage("");
		try {
			const result = await exchangeSignerTokenFn({ data: { token } });
			if ("error" in result) {
				if (result.reason && result.reason !== "ready") {
					setStopped({
						...peek,
						reason: result.reason,
					} as unknown as Peek);
				} else {
					setMessage(result.error);
				}
				setBusy(false);
				return;
			}
			try {
				sessionStorage.setItem(TOKEN_KEY, token);
			} catch {
				// Private mode: the page still works, it just can't re-open a timed-out session.
			}
			await navigate({ to: "/sign" });
		} catch {
			setMessage(CONNECTION);
			setBusy(false);
		}
	}

	if (stopped) return <NotReady peek={stopped} />;

	const last = peek.order === peek.count;
	const facts: { icon: typeof Users; text: string }[] = [];
	if (peek.count > 1) {
		facts.push({
			icon: Users,
			text: last
				? "You are the last signer."
				: `You are signer ${peek.order} of ${peek.count}.${peek.nextSignerName ? ` ${peek.nextSignerName} signs after you.` : ""}`,
		});
	}
	facts.push({
		icon: PenLine,
		text:
			peek.requiredFieldCount === 0
				? "You only need to review and sign. This usually takes about a minute."
				: `${peek.requiredFieldCount} ${peek.requiredFieldCount === 1 ? "field" : "fields"} to complete. This usually takes about a minute.`,
	});
	facts.push({
		icon: CalendarDays,
		text: `This link works until ${DATE.format(new Date(peek.expiresAt))}.`,
	});

	return (
		<>
			<p className="text-sm text-muted-foreground">
				{peek.senderName || "Someone"} has asked you to sign
			</p>
			<h1 className="mt-1 text-title font-semibold tracking-tight break-words text-foreground">
				{peek.title}
			</h1>

			<section className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
				<div className="flex items-center gap-4 p-4 sm:p-5">
					<span
						aria-hidden="true"
						className="grid size-12 shrink-0 place-items-center rounded-full border-2 bg-muted text-sm font-semibold text-foreground"
						style={{
							borderColor: `var(--signer-${((peek.order - 1) % 6) + 1})`,
						}}
					>
						{initials(peek.signerName)}
					</span>
					<div className="min-w-0">
						<p className="text-small text-muted-foreground">
							You are signing as
						</p>
						<p className="font-semibold break-words text-foreground">
							{peek.signerName}
						</p>
						<p className="text-sm break-all text-muted-foreground">
							{peek.signerEmail}
						</p>
					</div>
				</div>
				<ul className="divide-y divide-border border-t border-border">
					{facts.map(({ icon: Icon, text }) => (
						<li key={text} className="flex items-start gap-3 px-4 py-3 sm:px-5">
							<Icon
								aria-hidden="true"
								className="mt-0.5 size-5 shrink-0 text-muted-foreground"
								strokeWidth={1.75}
							/>
							<span className="text-foreground">{text}</span>
						</li>
					))}
				</ul>
			</section>

			{message ? (
				<Alert variant="destructive" role="alert" className="mt-4">
					<AlertDescription className="mt-0">{message}</AlertDescription>
				</Alert>
			) : null}

			<Button
				type="button"
				className="mt-6 h-12 w-full text-base"
				aria-disabled={busy}
				onClick={() => void open()}
			>
				{busy ? (
					<>
						<LoaderCircle
							aria-hidden="true"
							className="size-5 animate-spin motion-reduce:animate-none"
						/>
						Opening the document…
					</>
				) : (
					"Review and sign"
				)}
			</Button>
			<p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
				<Lock
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0"
					strokeWidth={1.75}
				/>
				Opening this document does not sign anything. You don't need an account,
				and you can decline if something looks wrong.
			</p>
			<p className="mt-6 border-t border-border pt-4 text-small text-muted-foreground">
				Not you? Don't continue. Ask {peek.senderName || "the sender"} (
				{peek.senderEmail}) to send the link to the right person.
			</p>
		</>
	);
}

function NotReady({ peek }: { peek: Peek }) {
	if (peek.reason === "ready") return null;
	const sender =
		"title" in peek
			? { name: peek.senderName, email: peek.senderEmail, title: peek.title }
			: null;
	return <InviteReasonScreen reason={peek.reason} sender={sender} />;
}
