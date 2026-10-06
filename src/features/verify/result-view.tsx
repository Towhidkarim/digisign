import {
	ChevronDown,
	CircleCheck,
	CircleX,
	FileText,
	Link2,
	type LucideIcon,
	SearchX,
	ShieldAlert,
	ShieldCheck,
	ShieldX,
	TriangleAlert,
} from "lucide-react";
import type { ReactNode, Ref } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	type CheckRows,
	checkRows,
	type FileResult,
	type FileSkip,
	type FoundRecord,
	type Outcome,
	type RowKey,
	type RowStatus,
} from "#/features/verify/outcome.ts";
import { cn } from "#/lib/utils.ts";
import type { VerifyRecord } from "#/server/domain/verify.ts";

export type Subject = { fileName: string | null; id: string };

export type VerifyResult = {
	outcome: Outcome;
	record: VerifyRecord | null;
	file: FileResult;
	subject: Subject;
};

type Tone = "success" | "danger" | "warning" | "brand" | "neutral";

const TONE: Record<Tone, { box: string; disc: string }> = {
	success: {
		box: "border-success/30 bg-success-bg text-success-fg",
		disc: "bg-success text-white",
	},
	danger: {
		box: "border-destructive/30 bg-danger-bg text-danger-fg",
		disc: "bg-destructive text-destructive-foreground",
	},
	warning: {
		box: "border-warning/30 bg-warning-bg text-warning-fg",
		disc: "bg-warning text-white",
	},
	brand: {
		box: "border-brand-soft bg-brand-bg text-brand-fg",
		disc: "bg-primary text-primary-foreground",
	},
	neutral: {
		box: "border-border bg-neutral-bg text-neutral-fg",
		disc: "bg-neutral text-white",
	},
};

type Verdict = {
	tone: Tone;
	icon: LucideIcon;
	title: string;
	text: string;
	next?: string;
};

const VERDICT: Record<Outcome, Verdict> = {
	valid: {
		tone: "success",
		icon: ShieldCheck,
		title: "Genuine and unchanged",
		text: "This file is exactly what DigiSign produced when signing finished, and the signed record behind it checks out.",
	},
	modified: {
		tone: "danger",
		icon: ShieldX,
		title: "This file has been changed",
		text: "The signed record is genuine, but this file is not the copy DigiSign produced. It may have been edited, or saved again by another app, after signing.",
		next: "Ask the sender for the original signed PDF, then check that one.",
	},
	"not-comparable": {
		tone: "warning",
		icon: TriangleAlert,
		title: "Record found, but this file can't be compared",
		text: "A genuine signed record exists for this document, but this file doesn't contain DigiSign's embedded record. It may be a printout, a scan, or a copy saved by another app.",
		next: "Try the PDF you downloaded from DigiSign or received from the sender.",
	},
	"record-only": {
		tone: "brand",
		icon: ShieldCheck,
		title: "Signed record found",
		text: "A genuine, completed record exists for this document. Add your copy of the signed PDF to check that it matches.",
	},
	"not-found": {
		tone: "neutral",
		icon: SearchX,
		title: "No signed record found",
		text: "There is no completed, signed document with this id. It may still be waiting for signatures, or have been declined or cancelled. The id may also be mistyped.",
	},
	"failed-checks": {
		tone: "danger",
		icon: ShieldAlert,
		title: "This record failed its checks",
		text: "A record exists, but it did not pass every integrity check. Don't rely on this document until the sender confirms it.",
		next: "Contact the sender and ask them to confirm the document.",
	},
	incomplete: {
		tone: "warning",
		icon: TriangleAlert,
		title: "We couldn't finish the check",
		text: "The original couldn't be loaded or re-created for comparison. Try again in a moment.",
	},
};

const ROWS: {
	key: RowKey;
	title: string;
	passed: string;
	failed: string;
}[] = [
	{
		key: "signature",
		title: "Signed by DigiSign",
		passed:
			"The completed record carries DigiSign's digital signature, and it checks out.",
		failed: "The digital signature on the record does not match.",
	},
	{
		key: "record",
		title: "Record is intact",
		passed: "The record matches the fingerprint stored when signing finished.",
		failed:
			"The record does not match the fingerprint stored when signing finished.",
	},
	{
		key: "original",
		title: "Original document on record",
		passed:
			"The document that was sent for signing is stored, and its details match what was signed.",
		failed: "The stored original does not match what was signed.",
	},
	{
		key: "history",
		title: "History is unbroken",
		passed:
			"Every step from creation to completion is recorded in order, with none missing or changed.",
		failed: "The history of this document has a gap or a change.",
	},
	{
		key: "file",
		title: "This file matches",
		passed:
			"Your file is identical to the copy DigiSign produced when signing finished.",
		failed:
			"Your file differs from the copy DigiSign produced when signing finished.",
	},
];

const SKIP_TEXT: Record<FileSkip, string> = {
	"no-file": "Add the signed PDF to check that your copy matches the record.",
	"no-manifest":
		"This file does not contain DigiSign's embedded record, so it can't be compared.",
	unfinished: "We couldn't finish comparing your file.",
	"record-failed": "Not compared, because the record itself failed its checks.",
};

const STATUS: Record<
	RowStatus,
	{ label: string; icon: LucideIcon; className: string }
> = {
	passed: { label: "Passed", icon: CircleCheck, className: "text-success-fg" },
	failed: { label: "Failed", icon: CircleX, className: "text-danger-fg" },
	"not-checked": {
		label: "Not checked",
		icon: CircleX,
		className: "text-muted-foreground",
	},
};

const TRY = [
	"Check the id against the footer of the signed PDF. It is 10 to 40 letters and numbers.",
	"Ask the sender whether everyone has finished signing. Only completed documents can be checked.",
	"If you have the PDF, add the file instead. It carries its own record.",
];

function Card({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn("rounded-xl border border-border bg-card", className)}
		>
			{children}
		</section>
	);
}

function Verdict({
	result,
	headingRef,
	onReset,
	onAddFile,
	onRetry,
	onCopy,
}: {
	result: VerifyResult;
	headingRef: Ref<HTMLHeadingElement>;
	onReset: () => void;
	onAddFile: () => void;
	onRetry: () => void;
	onCopy: () => void;
}) {
	const verdict = VERDICT[result.outcome];
	const tone = TONE[verdict.tone];
	const Icon = verdict.icon;
	const copy = (
		<Button
			type="button"
			variant="outline"
			className="bg-card text-foreground hover:bg-muted dark:bg-card max-sm:min-h-11"
			onClick={onCopy}
		>
			<Link2 aria-hidden="true" className="size-4" />
			Copy link to this record
		</Button>
	);
	const buttons: Record<Outcome, ReactNode> = {
		valid: copy,
		modified: (
			<Button
				type="button"
				variant="outline"
				className="bg-card text-foreground hover:bg-muted dark:bg-card max-sm:min-h-11"
				onClick={onReset}
			>
				Check another file
			</Button>
		),
		"not-comparable": null,
		"record-only": (
			<>
				<Button type="button" className="max-sm:min-h-11" onClick={onAddFile}>
					Add the signed PDF
				</Button>
				{copy}
			</>
		),
		"not-found": (
			<Button
				type="button"
				variant="outline"
				className="bg-card text-foreground hover:bg-muted dark:bg-card max-sm:min-h-11"
				onClick={onReset}
			>
				Try another id
			</Button>
		),
		"failed-checks": null,
		incomplete: (
			<Button type="button" className="max-sm:min-h-11" onClick={onRetry}>
				Try again
			</Button>
		),
	};
	return (
		<output className={cn("flex gap-4 rounded-xl border p-5 sm:p-6", tone.box)}>
			<span
				className={cn(
					"grid size-10 shrink-0 place-items-center rounded-full",
					tone.disc,
				)}
			>
				<Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
			</span>
			<div className="min-w-0">
				<h2
					ref={headingRef}
					tabIndex={-1}
					className="text-heading font-semibold outline-none"
				>
					{verdict.title}
				</h2>
				<p className="mt-1">{verdict.text}</p>
				{verdict.next ? (
					<p className="mt-2 text-sm font-medium">{verdict.next}</p>
				) : null}
				{buttons[result.outcome] ? (
					<div className="mt-4 flex flex-wrap gap-2">
						{buttons[result.outcome]}
					</div>
				) : null}
			</div>
		</output>
	);
}

function ChecksCard({ rows }: { rows: CheckRows }) {
	return (
		<Card className="p-5 sm:p-6">
			<h2 className="text-subheading font-semibold text-foreground">
				What we checked
			</h2>
			<ul className="mt-3 divide-y divide-border">
				{ROWS.map((row) => {
					const status = rows.status[row.key];
					const state = STATUS[status];
					const Icon = state.icon;
					const description =
						status === "passed"
							? row.passed
							: status === "failed"
								? row.failed
								: SKIP_TEXT[rows.fileSkip ?? "no-file"];
					return (
						<li key={row.key} className="flex items-start gap-3 py-3">
							<Icon
								aria-hidden="true"
								className={cn("mt-0.5 size-5 shrink-0", state.className)}
								strokeWidth={1.75}
							/>
							<div className="min-w-0 flex-1">
								<p className="font-medium text-foreground">{row.title}</p>
								<p className="text-sm text-muted-foreground">{description}</p>
							</div>
							<span
								className={cn(
									"shrink-0 text-small font-medium",
									state.className,
								)}
							>
								{state.label}
							</span>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}

function RecordCard({ record }: { record: FoundRecord }) {
	return (
		<Card>
			<div className="border-b border-border p-5 sm:px-6">
				<h2 className="text-subheading font-semibold break-words text-foreground">
					{record.title}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Completed {formatTime(record.manifest.completedAt)} · Document{" "}
					<span className="break-all">{record.documentId}</span>
				</p>
			</div>
			<div className="p-5 sm:px-6">
				<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Signed by
				</h3>
				<ol className="mt-2 divide-y divide-border">
					{record.manifest.signers.map((signer) => (
						<li key={signer.signerId} className="flex items-start gap-3 py-2.5">
							<span
								aria-hidden="true"
								className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
							>
								{signer.order}
							</span>
							<div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-3">
								<p className="font-medium break-words text-foreground">
									{signer.name}
								</p>
								<p className="text-small text-muted-foreground">
									{formatTime(signer.signedAt)}
								</p>
							</div>
						</li>
					))}
				</ol>
				<p className="mt-2 text-small text-muted-foreground">
					Names and times are as recorded when each person signed.
				</p>
			</div>
		</Card>
	);
}

const TIME = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
	timeZoneName: "short",
});

function formatTime(value: number) {
	return TIME.format(new Date(value));
}

function Disclosure({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<details className="group rounded-xl border border-border bg-card">
			<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-6 [&::-webkit-details-marker]:hidden">
				{title}
				<ChevronDown
					aria-hidden="true"
					className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
				/>
			</summary>
			<div className="border-t border-border p-5 sm:px-6">{children}</div>
		</details>
	);
}

const PROVES = [
	"The record was created by DigiSign and has not been altered.",
	"Every step from creation to completion is on record, in order.",
	"If you added a file, it is identical to the copy DigiSign produced.",
];

const DOES_NOT_PROVE = [
	"Who the signers are. Names are as entered when the document was prepared, and DigiSign does not independently confirm anyone's identity.",
	"That the contents are accurate or legally binding where you are.",
];

function ProvesCard() {
	return (
		<Disclosure title="What this check proves, and what it doesn't">
			<div className="grid gap-5 md:grid-cols-2 md:gap-8">
				<div>
					<h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<CircleCheck
							aria-hidden="true"
							className="size-4 text-success"
							strokeWidth={1.75}
						/>
						It proves
					</h3>
					<ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
						{PROVES.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
				<div>
					<h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<CircleX
							aria-hidden="true"
							className="size-4 text-muted-foreground"
							strokeWidth={1.75}
						/>
						It doesn't prove
					</h3>
					<ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
						{DOES_NOT_PROVE.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			</div>
		</Disclosure>
	);
}

function TechnicalCard({ record }: { record: FoundRecord }) {
	const rows: [string, string, boolean][] = [
		["Document id", record.documentId, true],
		["Signing key id", record.keyId, true],
		["Original SHA-256", record.manifest.source.sha256, true],
		["History events", String(record.manifest.audit.headSeq), false],
		[
			"Timestamp anchoring",
			record.anchored ? "Complete" : "In progress",
			false,
		],
	];
	return (
		<Disclosure title="Technical details">
			<dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
				{rows.map(([term, value, mono]) => (
					<div key={term} className="contents">
						<dt className="text-muted-foreground max-sm:-mb-2">{term}</dt>
						<dd
							className={cn(
								"break-all text-foreground",
								mono && "font-mono text-small",
							)}
						>
							{value}
						</dd>
					</div>
				))}
			</dl>
		</Disclosure>
	);
}

export function ResultView({
	result,
	headingRef,
	onReset,
	onAddFile,
	onRetry,
	onCopy,
}: {
	result: VerifyResult;
	headingRef: Ref<HTMLHeadingElement>;
	onReset: () => void;
	onAddFile: () => void;
	onRetry: () => void;
	onCopy: () => void;
}) {
	const record = result.record?.found ? result.record : null;
	return (
		<>
			<div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
				<p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
					<FileText
						aria-hidden="true"
						className="size-4 shrink-0"
						strokeWidth={1.75}
					/>
					<span className="min-w-0 break-words">
						Checked{" "}
						{result.subject.fileName ?? `document id ${result.subject.id}`}
					</span>
				</p>
				<Button
					type="button"
					variant="ghost"
					className="shrink-0 max-sm:min-h-11"
					onClick={onReset}
				>
					Check another document
				</Button>
			</div>
			<div className="mt-4 flex flex-col gap-4">
				<Verdict
					result={result}
					headingRef={headingRef}
					onReset={onReset}
					onAddFile={onAddFile}
					onRetry={onRetry}
					onCopy={onCopy}
				/>
				{result.outcome === "not-found" ? (
					<Card className="p-5 sm:p-6">
						<h2 className="text-subheading font-semibold text-foreground">
							What you can try
						</h2>
						<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
							{TRY.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ul>
					</Card>
				) : null}
				{record ? (
					<>
						<ChecksCard rows={checkRows(record, result.file)} />
						<RecordCard record={record} />
						<ProvesCard />
						<TechnicalCard record={record} />
					</>
				) : null}
			</div>
		</>
	);
}
