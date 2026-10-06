import { CircleCheck, Lock, TriangleAlert } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { countIssues, isReady, type SignerCheck } from "#/core/signer-rules.ts";
import type { EditorSigner } from "#/features/editor/reducer.ts";
import { cn } from "#/lib/utils.ts";

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "Needs name, email and signature field" from the rules that failed. */
function missingText(check: SignerCheck): string {
	const parts = [
		check.name ? "name" : "",
		check.email === "missing"
			? "email"
			: check.email
				? "a valid, different email"
				: "",
		check.signature ? "signature field" : "",
	].filter((part) => part.length > 0);
	if (parts.length <= 1) return `Needs ${parts[0] ?? ""}`;
	return `Needs ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function emailLine(check: SignerCheck, email: string): string {
	if (check.email === "missing") return "No email address";
	if (check.email === "invalid")
		return `${email.trim()} is not a valid email address`;
	if (check.email === "duplicate")
		return `${email.trim()} is used by another signer`;
	return email.trim();
}

/** The last look before sending. Sending itself stays in the editor: save, then publish. */
export function ReviewDialog({
	open,
	onOpenChange,
	fileName,
	pageCount,
	fieldCount,
	signers,
	checks,
	sending,
	onSend,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	fileName: string;
	pageCount: number;
	fieldCount: number;
	signers: readonly EditorSigner[];
	checks: readonly SignerCheck[];
	sending: boolean;
	onSend: () => void;
}) {
	const problems = countIssues(checks);
	const blocked = problems > 0;
	const first = signers[0]?.name.trim() || "The first signer";
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Closing mid-send would hide the result.
				if (!next && sending) return;
				onOpenChange(next);
			}}
		>
			<DialogContent aria-describedby="review-summary">
				<div>
					<DialogTitle>Review before sending</DialogTitle>
					<DialogDescription id="review-summary" className="mt-1">
						{fileName || "Document"} · {plural(pageCount, "page")} ·{" "}
						{plural(fieldCount, "field")}
					</DialogDescription>
				</div>
				{blocked ? (
					<div
						id="review-blockers"
						className="flex items-start gap-3 rounded-lg bg-warning-bg p-4 text-sm text-warning-fg"
					>
						<TriangleAlert
							aria-hidden="true"
							className="mt-0.5 size-5 shrink-0"
							strokeWidth={1.75}
						/>
						<p>
							{problems === 1 ? "1 thing needs" : `${problems} things need`}{" "}
							fixing before you can send. Go back to the editor to fix{" "}
							{problems === 1 ? "it" : "them"}.
						</p>
					</div>
				) : null}
				<section aria-labelledby="review-order">
					<h3
						id="review-order"
						className="text-[11px] leading-4 font-semibold tracking-wider text-muted-foreground uppercase"
					>
						Signing order
					</h3>
					<ol className="mt-2 divide-y divide-border rounded-lg border border-border">
						{signers.map((signer, index) => {
							const check = checks[index];
							const ready = check ? isReady(check) : false;
							return (
								<li
									key={signer.id}
									className="flex items-start gap-3 px-4 py-3"
								>
									<span
										aria-hidden="true"
										className="grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold"
										style={{ borderColor: signer.color }}
									>
										{index + 1}
									</span>
									<div className="min-w-0 flex-1">
										<div className="flex items-start justify-between gap-3">
											<p className="text-subheading font-semibold break-words">
												{signer.name.trim() || "Unnamed signer"}
											</p>
											<p
												className={cn(
													"flex shrink-0 items-center gap-1.5 text-small font-medium",
													ready ? "text-success-fg" : "text-danger-fg",
												)}
											>
												{ready ? (
													<CircleCheck
														aria-hidden="true"
														className="size-4"
														strokeWidth={1.75}
													/>
												) : (
													<TriangleAlert
														aria-hidden="true"
														className="size-4"
														strokeWidth={1.75}
													/>
												)}
												{ready ? "Ready" : check ? missingText(check) : ""}
											</p>
										</div>
										<p
											className={cn(
												"text-small break-all",
												check?.email
													? "text-danger-fg"
													: "text-muted-foreground",
											)}
										>
											{check ? emailLine(check, signer.email) : signer.email}
										</p>
									</div>
								</li>
							);
						})}
					</ol>
				</section>
				<div className="flex items-start gap-3 rounded-lg bg-accent p-4 text-sm text-muted-foreground">
					<Lock
						aria-hidden="true"
						className="mt-0.5 size-5 shrink-0"
						strokeWidth={1.75}
					/>
					<p>
						{first} is invited first. Each person is invited after the one
						before them signs. Once sent, this document can no longer be edited.
					</p>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						size="lg"
						disabled={sending}
						onClick={() => onOpenChange(false)}
					>
						Back to editing
					</Button>
					<Button
						type="button"
						size="lg"
						aria-disabled={blocked || sending}
						aria-describedby={blocked ? "review-blockers" : undefined}
						className={cn(
							(blocked || sending) && "cursor-not-allowed opacity-50",
						)}
						onClick={() => {
							if (blocked || sending) return;
							onSend();
						}}
					>
						{sending ? "Sending…" : "Send for signature"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
