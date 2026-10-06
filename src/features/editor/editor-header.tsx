import { Check, MoreHorizontal, TriangleAlert, X } from "lucide-react";

import { Stepper } from "#/components/stepper.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";

export type SaveState = "saving" | "saved" | "error" | "";

/** The editor's top bar (56px): close, file and save status, steps, problems, menu, send. */
export function EditorHeader({
	fileName,
	saveText,
	saveState,
	problems,
	sent,
	sending,
	onClose,
	onReplace,
	onSend,
}: {
	fileName: string;
	/** The existing copy: "Saving draft…", "Draft saved", "Draft not saved", or empty. */
	saveText: string;
	saveState: SaveState;
	problems: number;
	sent: boolean;
	sending: boolean;
	onClose: () => void;
	onReplace: () => void;
	onSend: () => void;
}) {
	return (
		<header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-4">
			<div className="flex min-w-0 items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Close"
					onClick={onClose}
				>
					<X strokeWidth={1.75} />
				</Button>
				<div className="min-w-0">
					<p className="max-w-[24ch] truncate text-sm font-semibold sm:max-w-[32ch]">
						{fileName || "Document"}
					</p>
					{saveText ? (
						<p
							className={
								saveState === "error"
									? "flex items-center gap-1 text-xs text-destructive"
									: "flex items-center gap-1 text-xs text-muted-foreground"
							}
						>
							{saveState === "saved" ? (
								<Check
									aria-hidden="true"
									className="size-3.5"
									strokeWidth={1.75}
								/>
							) : null}
							{saveText}
						</p>
					) : null}
				</div>
			</div>
			<Stepper compact current={1} className="hidden lg:flex" />
			<div className="flex items-center justify-end gap-2">
				{problems > 0 ? (
					<span
						className="hidden h-7 items-center gap-1.5 rounded-full bg-warning-bg px-3 text-xs font-medium whitespace-nowrap text-warning-fg sm:inline-flex"
						title="Signers who still need a signature or initials field"
					>
						<TriangleAlert
							aria-hidden="true"
							className="size-3.5"
							strokeWidth={1.75}
						/>
						{problems} to fix
					</span>
				) : null}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="More options"
						>
							<MoreHorizontal strokeWidth={1.75} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem disabled={sending} onSelect={onReplace}>
							Choose another PDF
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					type="button"
					size="lg"
					disabled={sent || sending}
					onClick={onSend}
				>
					{sending ? "Sending…" : "Review and send"}
				</Button>
			</div>
		</header>
	);
}
