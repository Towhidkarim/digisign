import {
	Ban,
	CircleCheck,
	CircleX,
	Clock,
	type LucideIcon,
	Pencil,
	Send,
} from "lucide-react";

import { cn } from "#/lib/utils.ts";

export type DocumentStatus =
	| "draft"
	| "in_progress"
	| "completed"
	| "declined"
	| "voided"
	| "expired";

export function isDocumentStatus(value: string): value is DocumentStatus {
	return value in STATUS;
}

const STATUS: Record<
	DocumentStatus,
	{ label: string; icon: LucideIcon; tone: string }
> = {
	draft: {
		label: "Draft",
		icon: Pencil,
		tone: "bg-neutral-bg text-neutral-fg",
	},
	in_progress: {
		label: "Out for signature",
		icon: Send,
		tone: "bg-brand-bg text-brand-fg",
	},
	completed: {
		label: "Completed",
		icon: CircleCheck,
		tone: "bg-success-bg text-success-fg",
	},
	declined: {
		label: "Declined",
		icon: CircleX,
		tone: "bg-danger-bg text-danger-fg",
	},
	voided: {
		label: "Voided",
		icon: Ban,
		tone: "bg-neutral-bg text-neutral-fg",
	},
	expired: {
		label: "Expired",
		icon: Clock,
		tone: "bg-warning-bg text-warning-fg",
	},
};

/** The six document states: icon plus label on the status tint, never color alone. */
export function StatusBadge({
	status,
	className,
}: {
	status: DocumentStatus;
	className?: string;
}) {
	const { label, icon: Icon, tone } = STATUS[status];
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
				tone,
				className,
			)}
		>
			<Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
			{label}
		</span>
	);
}

export type SignerStatus =
	| "pending"
	| "invited"
	| "signed"
	| "declined"
	| "voided";

const SIGNER_STATUS: Record<
	SignerStatus,
	{ label: string; icon: LucideIcon; tone: string }
> = {
	pending: {
		label: "Not sent yet",
		icon: Pencil,
		tone: "bg-neutral-bg text-neutral-fg",
	},
	invited: {
		label: "Waiting",
		icon: Send,
		tone: "bg-brand-bg text-brand-fg",
	},
	signed: {
		label: "Signed",
		icon: CircleCheck,
		tone: "bg-success-bg text-success-fg",
	},
	declined: {
		label: "Declined",
		icon: CircleX,
		tone: "bg-danger-bg text-danger-fg",
	},
	voided: {
		label: "Voided",
		icon: Ban,
		tone: "bg-neutral-bg text-neutral-fg",
	},
};

/** The five signer states, styled like StatusBadge. */
export function SignerStatusBadge({
	status,
	className,
}: {
	status: string;
	className?: string;
}) {
	const known = status in SIGNER_STATUS ? (status as SignerStatus) : "pending";
	const { label, icon: Icon, tone } = SIGNER_STATUS[known];
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
				tone,
				className,
			)}
		>
			<Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
			{label}
		</span>
	);
}
