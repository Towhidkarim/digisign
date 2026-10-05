import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { DocumentSheet } from "#/features/dashboard/document-list.tsx";
import {
	displayTitle,
	eventLabel,
	formatUpdated,
	formatWhen,
	signerLabel,
	signerTone,
	statusLabel,
	statusTone,
} from "#/features/dashboard/format.ts";
import { reissueInviteFn, voidDocumentFn } from "#/server/documents.ts";
import type {
	OwnedDocumentDetail,
	OwnedSigner,
} from "#/server/domain/documents.ts";

type Notice = { tone: "ok" | "err"; text: string };

export function DocumentDesk({ document }: { document: OwnedDocumentDetail }) {
	const router = useRouter();
	const [notice, setNotice] = useState<Notice | null>(null);
	const [busy, setBusy] = useState<"link" | "void" | null>(null);
	const [confirmVoid, setConfirmVoid] = useState(false);
	const invited = document.signers.find(
		(signer) => signer.status === "invited",
	);
	const completed = document.status === "completed";

	return (
		<div>
			<Link
				to="/documents"
				className="text-sm font-medium text-primary no-underline hover:text-primary"
			>
				Documents
			</Link>
			<h1 className="mt-4 max-w-[24ch] text-[clamp(1.7rem,3vw,2.1rem)] font-semibold tracking-tight break-words">
				{displayTitle(document.title)}
			</h1>
			<p className={`mt-2 text-sm ${statusTone(document.status)}`}>
				{statusLabel(document.status)}
			</p>
			<p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
				<DeskSummary document={document} invited={invited} />
			</p>
			<div className="mt-6 flex flex-wrap gap-2">
				{document.status === "draft" ? (
					<Button asChild size="sm">
						<Link to="/prepare" search={{ documentId: document.id }}>
							Continue editing
						</Link>
					</Button>
				) : null}
				{invited ? (
					<Button
						type="button"
						size="sm"
						disabled={busy !== null}
						onClick={() => {
							setConfirmVoid(false);
							setBusy("link");
							setNotice(null);
							void reissueInviteFn({ data: { signerId: invited.id } }).then(
								async (result) => {
									setBusy(null);
									if ("error" in result) {
										setNotice({ tone: "err", text: result.error });
										return;
									}
									try {
										await navigator.clipboard.writeText(result.url);
										setNotice({
											tone: "ok",
											text: "Link copied. The previous link no longer works, and a new one was sent.",
										});
									} catch {
										setNotice({
											tone: "ok",
											text: `The previous link no longer works. Copy this one: ${result.url}`,
										});
									}
									await router.invalidate();
								},
							);
						}}
					>
						{busy === "link" ? "Copying…" : "Copy a new signing link"}
					</Button>
				) : null}
				{completed ? (
					<Button asChild size="sm" variant={invited ? "outline" : "default"}>
						<Link to="/v/$documentId" params={{ documentId: document.id }}>
							Check this PDF
						</Link>
					</Button>
				) : null}
				{document.uploaded ? (
					<Button asChild variant="outline" size="sm">
						<a href={`/files/documents/${document.id}/source`}>Download PDF</a>
					</Button>
				) : null}
				{document.status === "in_progress" ? (
					<Button
						type="button"
						variant={confirmVoid ? "destructive" : "outline"}
						size="sm"
						disabled={busy !== null}
						onClick={() => {
							if (!confirmVoid) {
								setConfirmVoid(true);
								setNotice({
									tone: "err",
									text: "Voiding stops this document. The current signing link will no longer work.",
								});
								return;
							}
							setBusy("void");
							void voidDocumentFn({
								data: { documentId: document.id },
							}).then(async (result) => {
								setBusy(null);
								setConfirmVoid(false);
								if ("error" in result) {
									setNotice({ tone: "err", text: result.error });
									return;
								}
								setNotice({ tone: "ok", text: "This document is voided." });
								await router.invalidate();
							});
						}}
					>
						{busy === "void"
							? "Voiding…"
							: confirmVoid
								? "Void it"
								: "Void this document"}
					</Button>
				) : null}
			</div>
			{notice ? (
				<p
					className={`mt-3 max-w-[52ch] text-sm break-words ${notice.tone === "err" ? "text-destructive" : "text-muted-foreground"}`}
				>
					{notice.text}
				</p>
			) : null}

			<DocumentSheet>
				<ul>
					{document.signers.length === 0 ? (
						<li className="py-5 text-sm text-muted-foreground">
							No one is named on this document yet.
						</li>
					) : (
						document.signers.map((signer, index) => (
							<SignerRow
								key={signer.id}
								signer={signer}
								divided={index < document.signers.length - 1}
							/>
						))
					)}
				</ul>
			</DocumentSheet>

			<DocumentSheet>
				<h2 className="pt-5 font-medium">Activity</h2>
				{document.activity.length === 0 ? (
					<p className="py-5 text-sm text-muted-foreground">
						Nothing has been recorded yet.
					</p>
				) : (
					<ol>
						{document.activity.map((event, index) => (
							<li
								key={event.seq}
								className={
									index < document.activity.length - 1
										? "flex items-start justify-between gap-6 border-b border-[var(--tide)] py-5"
										: "flex items-start justify-between gap-6 py-5"
								}
							>
								<div className="min-w-0">
									<p className="font-medium">
										{eventLabel(event.type, event.reissue)}
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										{event.actorType === "owner"
											? "You"
											: (event.actorName ?? "DigiSign")}
									</p>
								</div>
								<time
									dateTime={new Date(event.occurredAt).toISOString()}
									className="shrink-0 text-sm text-muted-foreground tabular-nums"
								>
									{formatWhen(event.occurredAt)}
								</time>
							</li>
						))}
					</ol>
				)}
			</DocumentSheet>
		</div>
	);
}

function SignerRow({
	signer,
	divided,
}: {
	signer: OwnedSigner;
	divided: boolean;
}) {
	const evidence = captured(signer);
	return (
		<li className={divided ? "border-b border-[var(--tide)] py-5" : "py-5"}>
			<p className="font-medium">
				{signer.order}. {signer.name}
			</p>
			{signer.email ? (
				<p className="mt-1 text-sm break-all text-muted-foreground">
					{signer.email}
				</p>
			) : null}
			<p className={`mt-1 text-sm ${signerTone(signer.status)}`}>
				{signerLabel(signer.status)}
			</p>
			{signerMoment(signer) ? (
				<p className="mt-1 text-sm text-muted-foreground tabular-nums">
					{formatWhen(signerMoment(signer) ?? 0)}
				</p>
			) : null}
			{signer.declineReason ? (
				<p className="mt-2 max-w-[52ch] text-sm text-destructive">
					{signer.declineReason}
				</p>
			) : null}
			{evidence.address ? (
				<p className="mt-3 max-w-[52ch] text-sm break-words">
					<span className="text-muted-foreground">Address </span>
					{evidence.address}
				</p>
			) : null}
			{evidence.browser ? (
				<p className="mt-2 max-w-[52ch] text-sm break-words">
					<span className="text-muted-foreground">Browser </span>
					{evidence.browser}
				</p>
			) : null}
		</li>
	);
}

function DeskSummary({
	document,
	invited,
}: {
	document: OwnedDocumentDetail;
	invited: OwnedSigner | undefined;
}) {
	const signed = document.signers.filter(
		(signer) => signer.status === "signed",
	).length;
	const parts = [
		document.signers.length > 0
			? `${signed} of ${document.signers.length} signed`
			: "",
		invited ? `Waiting on ${invited.name}` : "",
		document.expiresAt != null && document.status === "in_progress"
			? `Expires ${formatUpdated(document.expiresAt)}`
			: "",
		document.pageCount > 0
			? `${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}`
			: "",
	].filter((part) => part.length > 0);
	return parts.length > 0 ? parts.join(". ") : "Nothing else is recorded yet.";
}

function signerMoment(signer: OwnedSigner): number | null {
	return signer.signedAt ?? signer.firstViewedAt ?? signer.invitedAt;
}

function captured(signer: OwnedSigner): { address: string; browser: string } {
	if (signer.status !== "signed") return { address: "", browser: "" };
	const address = signer.clientIp?.trim() || "";
	return {
		address: address === "unknown" ? "" : address,
		browser: signer.userAgent?.trim() || "",
	};
}
