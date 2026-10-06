import { CircleCheck, FileText, Lock, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { sha256Hex } from "#/core/hash.ts";
import { CheckingCard, type Phase } from "#/features/verify/checking-card.tsx";
import { type Identified, identifyPdf } from "#/features/verify/identify.ts";
import {
	decideOutcome,
	type FileResult,
	type FoundRecord,
	fileResultFromRender,
	type Rendered,
	recordIsGenuine,
	toLocalManifest,
} from "#/features/verify/outcome.ts";
import {
	ResultView,
	type VerifyResult,
} from "#/features/verify/result-view.tsx";
import { VerifyLayout } from "#/features/verify/verify-layout.tsx";
import { cn } from "#/lib/utils.ts";
import { loadScriptFonts } from "#/pdf/fonts.ts";
import { render } from "#/pdf/render.ts";
import type { VerifyRecord } from "#/server/domain/verify.ts";
import { verifyManifestFn } from "#/server/verify.ts";

const ID = /^[0-9A-Za-z]{10,40}$/;

const BAD_URL_ID =
	"That document id doesn't look right. Check it and try again.";

const NO_ID_MESSAGE =
	"This file names no DigiSign document. Type the document id below.";

const VIA_TEXT = {
	manifest: "embedded record",
	info: "document properties",
	footer: "page footer",
} as const;

const STEPS = [
	"Add the signed PDF, or type the document id printed in its footer.",
	"We compare it with the record DigiSign kept when signing finished.",
	"You see whether it is genuine and unchanged, and who signed.",
];

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LastRun = {
	id: string;
	bytes: Uint8Array | null;
	found: Identified | null;
	name: string | null;
};

export function VerifyDesk({ initialId }: { initialId?: string }) {
	const [typedId, setTypedId] = useState(initialId ?? "");
	const [fileName, setFileName] = useState("");
	const [fileSize, setFileSize] = useState(0);
	const [dragging, setDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const [identified, setIdentified] = useState<Identified | null>(null);
	const [result, setResult] = useState<VerifyResult | null>(null);
	const [message, setMessage] = useState(
		initialId && !ID.test(initialId) ? BAD_URL_ID : "",
	);
	const [busy, setBusy] = useState(false);
	const [phase, setPhase] = useState<Phase>("record");
	const [running, setRunning] = useState<LastRun | null>(null);
	const droppedRef = useRef<Uint8Array | null>(null);

	const run = useCallback(
		async (
			id: string,
			bytes: Uint8Array | null,
			found: Identified | null,
			name: string | null,
		) => {
			setRunning({ id, bytes, found, name });
			setBusy(true);
			setMessage("");
			setResult(null);
			setPhase("record");
			const subject = { fileName: name, id };
			const finish = (record: VerifyRecord | null, file: FileResult) =>
				setResult({
					outcome: decideOutcome(record, file),
					record,
					file,
					subject,
				});
			let record: VerifyRecord;
			try {
				record = await verifyManifestFn({ data: { documentId: id } });
			} catch {
				finish(null, { kind: "none" });
				setBusy(false);
				return;
			}
			try {
				if (!recordIsGenuine(record) || !bytes) {
					finish(record, { kind: "none" });
					return;
				}
				setPhase("file");
				const droppedSha256 = await sha256Hex(bytes);
				if (!found?.embeddedManifest) {
					finish(record, { kind: "no-manifest" });
					return;
				}
				setPhase("compare");
				finish(
					record,
					fileResultFromRender(
						await renderedHash(record, found.verifyOrigin),
						droppedSha256,
					),
				);
			} catch {
				finish(record, { kind: "error" });
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	useEffect(() => {
		if (initialId && ID.test(initialId)) {
			void run(initialId, null, null, null);
		}
	}, [initialId, run]);

	useEffect(() => {
		if (result) headingRef.current?.focus();
	}, [result]);

	async function choose(file: File | undefined) {
		if (!file) return;
		setResult(null);
		setMessage("");
		setFileName(file.name);
		setFileSize(file.size);
		const bytes = new Uint8Array(await file.arrayBuffer());
		droppedRef.current = bytes;
		const found = await identifyPdf(bytes);
		setIdentified(found);
		const id =
			found.documentId ?? (ID.test(typedId.trim()) ? typedId.trim() : null);
		if (!id) {
			setMessage(NO_ID_MESSAGE);
			return;
		}
		setTypedId(id);
		await run(id, bytes, found, file.name);
	}

	async function checkTyped() {
		const id = typedId.trim();
		if (!ID.test(id)) {
			setMessage("Enter the document id printed in the PDF footer.");
			return;
		}
		await run(id, droppedRef.current, identified, fileName || null);
	}

	function remove() {
		if (identified?.documentId && identified.documentId === typedId) {
			setTypedId("");
		}
		droppedRef.current = null;
		setFileName("");
		setFileSize(0);
		setIdentified(null);
		setResult(null);
		setMessage("");
		if (inputRef.current) inputRef.current.value = "";
	}

	function reset() {
		setTypedId("");
		droppedRef.current = null;
		setFileName("");
		setFileSize(0);
		setIdentified(null);
		setResult(null);
		setMessage("");
		setRunning(null);
	}

	function addFile() {
		setResult(null);
		setMessage("");
	}

	function retry() {
		if (running) {
			void run(running.id, running.bytes, running.found, running.name);
		}
	}

	function copyLink() {
		if (!result) return;
		const link = `${window.location.origin}/v/${result.subject.id}`;
		navigator.clipboard.writeText(link).then(
			() => toast.success("Link copied"),
			() => toast.error("Couldn't copy the link"),
		);
	}

	function drop(file: File | undefined) {
		setDragging(false);
		if (!file) return;
		if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
			setMessage("Choose a PDF file.");
			return;
		}
		void choose(file);
	}

	const hasFile = Boolean(fileName);
	const blocked = busy || !(hasFile || ID.test(typedId.trim()));

	return (
		<VerifyLayout>
			{result ? (
				<ResultView
					result={result}
					headingRef={headingRef}
					onReset={reset}
					onAddFile={addFile}
					onRetry={retry}
					onCopy={copyLink}
				/>
			) : (
				<>
					<h1 className="text-title font-semibold tracking-tight text-foreground">
						Check a signed document
					</h1>
					<p className="mt-2 text-muted-foreground">
						Find out whether a PDF signed with DigiSign is genuine and has not
						been changed. You don't need an account.
					</p>
					{busy ? (
						<div className="mt-8">
							<CheckingCard
								fileName={running?.name ?? null}
								fileSize={fileSize ? formatSize(fileSize) : null}
								id={running?.id ?? ""}
								phase={phase}
								withFile={Boolean(running?.bytes)}
							/>
						</div>
					) : (
						<div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-5">
							{hasFile ? (
								<div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
									<span className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground">
										<FileText
											aria-hidden="true"
											className="size-5"
											strokeWidth={1.75}
										/>
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-foreground">
											{fileName}
										</p>
										<p className="text-small text-muted-foreground">
											{formatSize(fileSize)}
										</p>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="max-sm:size-11"
										aria-label={`Remove ${fileName}`}
										onClick={remove}
									>
										<X aria-hidden="true" className="size-4" />
									</Button>
								</div>
							) : (
								// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the "Choose a file" button inside is the keyboard path
								<div
									className={cn(
										"flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
										dragging ? "border-primary bg-brand-bg" : "border-input",
									)}
									onClick={() => inputRef.current?.click()}
									onDragOver={(event) => {
										event.preventDefault();
										setDragging(true);
									}}
									onDragLeave={() => setDragging(false)}
									onDrop={(event) => {
										event.preventDefault();
										drop(event.dataTransfer.files[0]);
									}}
								>
									<span className="grid size-12 place-items-center rounded-full bg-brand-bg text-brand-fg">
										<Upload
											aria-hidden="true"
											className="size-5"
											strokeWidth={1.75}
										/>
									</span>
									<p className="mt-4 font-semibold text-foreground">
										Drop the signed PDF here
									</p>
									<p className="text-small text-muted-foreground">
										or choose a file from your device
									</p>
									<Button
										type="button"
										variant="outline"
										className="mt-4 max-sm:min-h-11"
									>
										Choose a file
									</Button>
								</div>
							)}
							<input
								ref={inputRef}
								id="verify-file"
								type="file"
								accept="application/pdf"
								tabIndex={-1}
								aria-hidden="true"
								className="sr-only"
								onChange={(event) => void choose(event.target.files?.[0])}
							/>
							{hasFile && identified?.documentId ? (
								<p className="mt-3 flex items-start gap-2 text-sm text-success-fg">
									<CircleCheck
										aria-hidden="true"
										className="mt-0.5 size-4 shrink-0"
										strokeWidth={1.75}
									/>
									<span>
										This file names document{" "}
										<strong className="font-semibold break-all">
											{identified.documentId}
										</strong>
										, found in its {VIA_TEXT[identified.via ?? "manifest"]}.
									</span>
								</p>
							) : null}
							{message ? (
								<Alert
									role="alert"
									variant={
										message === NO_ID_MESSAGE ? "warning" : "destructive"
									}
									className="mt-3"
								>
									<AlertDescription className="mt-0">
										{message}
									</AlertDescription>
								</Alert>
							) : null}
							{hasFile ? null : (
								<div className="my-5 flex items-center gap-3 text-small text-muted-foreground">
									<span aria-hidden="true" className="h-px flex-1 bg-border" />
									or check by document id
									<span aria-hidden="true" className="h-px flex-1 bg-border" />
								</div>
							)}
							<div className={hasFile ? "mt-5" : undefined}>
								<label
									htmlFor="verify-id"
									className="text-sm font-medium text-foreground"
								>
									Document id
								</label>
								<Input
									id="verify-id"
									value={typedId}
									placeholder="For example 01M46PYG4R5D25M3VSTA"
									autoComplete="off"
									spellCheck={false}
									aria-describedby="verify-id-help"
									onChange={(event) => setTypedId(event.target.value)}
									className="mt-2 h-11 placeholder:text-sm"
								/>
								<p
									id="verify-id-help"
									className="mt-1.5 text-small text-muted-foreground"
								>
									Printed in the footer of every page of the signed PDF.
								</p>
							</div>
							<Button
								type="button"
								className="mt-5 h-11 w-full"
								disabled={blocked}
								aria-disabled={blocked}
								onClick={() => void checkTyped()}
							>
								Check document
							</Button>
							<p className="mt-4 flex items-start gap-2 text-small text-muted-foreground">
								<Lock
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0"
									strokeWidth={1.75}
								/>
								Your PDF is checked in this browser and is never uploaded. To
								compare it, we fetch the original from DigiSign's record.
							</p>
						</div>
					)}
					{busy ? null : (
						<ol className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-6">
							{STEPS.map((step, index) => (
								<li
									key={step}
									className="flex items-start gap-3 text-sm text-muted-foreground"
								>
									<span
										aria-hidden="true"
										className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-bg text-xs font-semibold text-brand-fg"
									>
										{index + 1}
									</span>
									{step}
								</li>
							))}
						</ol>
					)}
				</>
			)}
		</VerifyLayout>
	);
}

async function renderedHash(
	record: FoundRecord,
	origin: string | null,
): Promise<Rendered> {
	try {
		const response = await fetch(
			`/files/documents/${record.documentId}/source?grant=${encodeURIComponent(record.grant)}`,
		);
		if (!response.ok) return { kind: "error" };
		const original = new Uint8Array(await response.arrayBuffer());
		if ((await sha256Hex(original)) !== record.manifest.source.sha256) {
			return { kind: "mismatch" };
		}
		const rendered = await render(original, toLocalManifest(record), {
			fonts: await loadScriptFonts(),
			verifyOrigin: origin ?? window.location.origin,
		});
		return { kind: "ok", sha256: await sha256Hex(rendered) };
	} catch {
		return { kind: "error" };
	}
}
