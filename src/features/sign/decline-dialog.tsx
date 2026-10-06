import { useId, useState } from "react";

import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";

export const REASON_LIMIT = 500;

export function DeclineDialog({
	open,
	onOpenChange,
	senderName,
	busy,
	error,
	onDecline,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	senderName: string;
	busy: boolean;
	error: string;
	onDecline: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const id = useId();
	const sender = senderName || "The sender";
	const blank = reason.trim().length === 0;
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => !busy && onOpenChange(next)}
		>
			<AlertDialogContent sheet className="max-md:rounded-t-2xl md:max-w-lg">
				<div
					aria-hidden="true"
					className="mx-auto -mt-1 h-1 w-10 rounded-full bg-border md:hidden"
				/>
				<AlertDialogTitle className="text-heading font-semibold">
					Decline to sign?
				</AlertDialogTitle>
				<AlertDialogDescription className="text-base">
					Signing stops for everyone. {sender} and the other signers will be
					told that you declined. This can't be undone.
				</AlertDialogDescription>
				<div className="flex flex-col gap-2">
					<label htmlFor={id} className="font-medium text-foreground">
						Why are you declining?
					</label>
					<textarea
						id={id}
						value={reason}
						maxLength={REASON_LIMIT}
						placeholder={`Write a short reason. ${senderName || "The sender"} will see it.`}
						className="min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						onChange={(event) => setReason(event.target.value)}
					/>
					<p className="text-right text-small text-muted-foreground">
						{reason.length} of {REASON_LIMIT}
					</p>
				</div>
				{error ? (
					<Alert variant="destructive" role="alert">
						<AlertDescription className="mt-0">{error}</AlertDescription>
					</Alert>
				) : null}
				<div className="flex flex-col gap-2">
					<AlertDialogCancel asChild>
						<Button
							type="button"
							className="h-12 w-full text-base"
							disabled={busy}
						>
							Keep signing
						</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							type="button"
							variant="outline"
							className="h-12 w-full border-destructive text-base text-destructive hover:bg-danger-bg hover:text-danger-fg"
							disabled={blank || busy}
							onClick={(event) => {
								event.preventDefault();
								onDecline(reason.trim());
							}}
						>
							{busy ? "Declining…" : "Decline this document"}
						</Button>
					</AlertDialogAction>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	);
}
