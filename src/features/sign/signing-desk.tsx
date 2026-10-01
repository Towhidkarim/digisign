import { Link } from "@tanstack/react-router";
import { Asterisk } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import type { FieldInput, FieldValue } from "#/core/contracts/index.ts";
import { microToPercent, viewSize } from "#/core/coords.ts";
import { limits } from "#/core/limits.ts";
import {
	declineSignature,
	getDraft,
	getSigningContext,
	hydrateDraft,
	submitSignature,
} from "#/features/editor/draft.ts";
import { FIELD_LABEL } from "#/features/editor/reducer.ts";
import { unpackStrokes } from "#/features/sign/capture.ts";
import { CaptureSheet } from "#/features/sign/capture-sheet.tsx";
import { FittedScript } from "#/features/sign/fitted-script.tsx";
import { buildManifest } from "#/features/sign/manifest.ts";
import type { SigningContext } from "#/features/sign/session.ts";
import { formatSignedAt } from "#/features/sign/values.ts";
import {
	installScriptFaces,
	loadScriptFonts,
	SCRIPT_FACE,
} from "#/pdf/fonts.ts";
import { checkFractions, inkFractions, inkStrokeWidth } from "#/pdf/ink.ts";
import "#/pdf/setup.ts";
import { render } from "#/pdf/render.ts";

export function SigningDesk() {
	const [context, setContext] = useState<SigningContext | null>(null);
	const [error, setError] = useState("");
	const [ready, setReady] = useState(false);

	useEffect(() => {
		hydrateDraft();
		let cancelled = false;
		void getSigningContext().then((result) => {
			if (cancelled) return;
			if ("error" in result) setError(result.error);
			else setContext(result);
			setReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!ready) {
		return (
			<p className="px-6 py-16 text-sm text-muted-foreground">
				Opening the document…
			</p>
		);
	}
	if (error || !context) {
		return (
			<main className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-16">
				<h1 className="text-2xl font-semibold text-[var(--harbor)]">
					Nothing to sign
				</h1>
				<p className="text-sm text-foreground">{error}</p>
				<Link to="/prepare" className="text-sm text-[var(--harbor)]">
					Prepare a document
				</Link>
			</main>
		);
	}
	if (context.status === "declined") {
		return (
			<main className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-16">
				<h1 className="text-2xl font-semibold text-[var(--harbor)]">
					Signing stopped
				</h1>
				<p className="text-sm text-foreground">
					{context.signer.name} declined this document.
					{context.declineReason ? ` ${context.declineReason}` : ""}
				</p>
				<Link to="/" className="text-sm text-[var(--harbor)]">
					Back home
				</Link>
			</main>
		);
	}
	if (context.status === "completed") {
		return <Finished context={context} />;
	}
	return (
		<Walk
			key={context.signer.id}
			context={context}
			onContext={(next) => {
				setError("");
				setContext(next);
			}}
		/>
	);
}

function Walk({
	context,
	onContext,
}: {
	context: SigningContext;
	onContext: (next: SigningContext) => void;
}) {
	const source = getDraft().bytes;
	const file = useMemo(() => (source ? pdfBlob(source) : null), [source]);
	const [answers, setAnswers] = useState<FieldValue[]>([]);
	const [consent, setConsent] = useState(false);
	const [captureId, setCaptureId] = useState<string | null>(null);
	const [focusId, setFocusId] = useState<string | null>(null);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [declineOpen, setDeclineOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [frame, setFrame] = useState({ width: 720, height: 900 });
	const [zoom, setZoom] = useState<SignZoom>({ mode: "percent", percent: 100 });
	const scrollerRef = useRef<HTMLDivElement>(null);
	const prior = context.records.flatMap((record) => record.values);

	useEffect(() => {
		const node = scrollerRef.current;
		if (!node) return;
		const measure = () => {
			setFrame({
				width: Math.max(280, node.clientWidth - 48),
				height: Math.max(280, node.clientHeight - 48),
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		void installScriptFaces();
	}, []);

	function goToNextRequired() {
		const missing = context.fields.filter(
			(field) => field.required && !fieldFilled(field, answers),
		);
		if (missing.length === 0) return;
		const current = missing.findIndex((field) => field.id === focusId);
		const next = missing[(current + 1) % missing.length];
		if (!next) return;
		setFocusId(next.id);
		document
			.querySelector(`[data-field-id="${next.id}"]`)
			?.scrollIntoView({ behavior: "smooth", block: "center" });
	}

	async function sign() {
		const missing = context.fields.find(
			(field) => field.required && !fieldFilled(field, answers),
		);
		if (missing) {
			setFocusId(missing.id);
			setMessage("Complete the required fields first.");
			document
				.querySelector(`[data-field-id="${missing.id}"]`)
				?.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}
		if (!consent) {
			setMessage("Confirm the disclosure before signing.");
			return;
		}
		setBusy(true);
		setMessage("");
		const result = await submitSignature({
			idempotencyKey: crypto.randomUUID(),
			stateHash: context.stateHash,
			consent: true,
			values: answers,
		});
		setBusy(false);
		if ("error" in result) {
			setMessage(result.error);
			return;
		}
		onContext(result);
	}

	async function decline() {
		setBusy(true);
		const result = await declineSignature(reason);
		setBusy(false);
		if ("error" in result) {
			setMessage(result.error);
			return;
		}
		setDeclineOpen(false);
		onContext(result);
	}

	const capturing = context.fields.find((field) => field.id === captureId);

	return (
		<div className="flex h-svh flex-col bg-background">
			<header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
				<Link
					to="/"
					className="text-lg font-semibold tracking-tight"
					style={{ color: "var(--harbor)", textDecoration: "none" }}
				>
					DigiSign
				</Link>
				<p className="min-w-0 flex-1 truncate text-sm text-foreground">
					{context.signer.name} · signer {context.signerIndex + 1} of{" "}
					{context.signerCount}
				</p>
				<ZoomControls zoom={zoom} onZoom={setZoom} />
				<button
					type="button"
					className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent"
					onClick={goToNextRequired}
				>
					Next required field
				</button>
				<Link to="/prepare" className="text-sm text-[var(--harbor)]">
					Back to prepare
				</Link>
			</header>
			<div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto">
				{file ? (
					<Document
						file={file}
						suspense={false}
						loading={
							<p className="py-16 text-sm text-muted-foreground">
								Opening the PDF…
							</p>
						}
						error={
							<p className="py-16 text-sm text-destructive">
								This file could not be read as a PDF.
							</p>
						}
					>
						<div className="flex flex-col items-center gap-6 px-6 py-6">
							{context.upload.geometry.map((page, index) => {
								const { viewW, viewH } = viewSize(page);
								const { width, height } = pagePixels(viewW, viewH, zoom, frame);
								return (
									<div
										key={pageIndexKey(index)}
										data-page-index={index}
										className="relative border border-border bg-white"
										style={{ width, height }}
									>
										<Page
											pageNumber={index + 1}
											width={width}
											devicePixelRatio={cappedDevicePixelRatio()}
											renderTextLayer={false}
											renderAnnotationLayer={false}
											suspense={false}
											loading={null}
											className="absolute top-0 left-0"
										/>
										<div className="pointer-events-none absolute inset-0 z-10">
											{prior.map((value) => {
												const field = context.layout.fields.find(
													(item) => item.id === value.fieldId,
												);
												if (!field || field.pageIndex !== index) return null;
												return (
													<PriorInk
														key={value.fieldId}
														field={field}
														value={value}
														viewW={viewW}
														viewH={viewH}
													/>
												);
											})}
										</div>
										{context.fields
											.filter((field) => field.pageIndex === index)
											.map((field) => (
												<SignerField
													key={field.id}
													field={field}
													viewW={viewW}
													viewH={viewH}
													color={context.signer.color}
													name={context.signer.name}
													value={answers.find(
														(item) => item.fieldId === field.id,
													)}
													focused={focusId === field.id}
													onSignature={() => setCaptureId(field.id)}
													onText={(text) =>
														setAnswers((current) =>
															upsert(current, { fieldId: field.id, text }),
														)
													}
													onCheck={(checked) =>
														setAnswers((current) =>
															upsert(current, { fieldId: field.id, checked }),
														)
													}
												/>
											))}
									</div>
								);
							})}
						</div>
					</Document>
				) : null}
			</div>
			<footer className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-3 py-3">
				<label className="flex min-w-0 flex-1 items-start gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						className="mt-1"
						checked={consent}
						onChange={(event) => setConsent(event.target.checked)}
					/>
					<span>
						I agree to sign this document electronically. This signature is as
						binding as one written by hand.
					</span>
				</label>
				<button
					type="button"
					className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:underline"
					onClick={() => setDeclineOpen(true)}
				>
					Decline
				</button>
				<button
					type="button"
					className="rounded-md bg-[var(--harbor)] px-3 py-2 text-sm text-white disabled:opacity-40"
					disabled={busy}
					onClick={() => void sign()}
				>
					{context.signerIndex + 1 === context.signerCount
						? "Finish signing"
						: "Sign and continue"}
				</button>
				{message ? (
					<p className="basis-full text-sm text-destructive">{message}</p>
				) : null}
			</footer>
			{capturing ? (
				<CaptureSheet
					key={capturing.id}
					title={FIELD_LABEL[capturing.kind]}
					existing={
						answers.find((item) => item.fieldId === capturing.id)?.signature
					}
					onCancel={() => setCaptureId(null)}
					onUse={(signature) => {
						setAnswers((current) =>
							upsert(current, { fieldId: capturing.id, signature }),
						);
						setCaptureId(null);
					}}
				/>
			) : null}
			<AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Decline this document?</AlertDialogTitle>
						<AlertDialogDescription>
							Signing stops for everyone. Say why you are declining.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<textarea
						value={reason}
						maxLength={500}
						className="min-h-24 w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onChange={(event) => setReason(event.target.value)}
					/>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep signing</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={busy || reason.trim().length === 0}
							onClick={(event) => {
								event.preventDefault();
								void decline();
							}}
						>
							Decline
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function Finished({ context }: { context: SigningContext }) {
	const [bytes, setBytes] = useState<Uint8Array | null>(null);
	const [pageCount, setPageCount] = useState(0);
	const [message, setMessage] = useState("Preparing the signed PDF…");
	const [frame, setFrame] = useState({ width: 720, height: 900 });
	const [zoom, setZoom] = useState<SignZoom>({ mode: "percent", percent: 100 });
	const scrollerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const draft = getDraft();
		const sourceBytes = draft.bytes;
		const upload = draft.upload;
		const layout = draft.layout;
		if (!sourceBytes || !upload || !layout) {
			setMessage("The prepared PDF is no longer available.");
			return;
		}
		let cancelled = false;
		void (async () => {
			const manifest = await buildManifest({
				fileName: draft.fileName,
				upload,
				layout,
				signers: draft.signers,
				records: context.records,
			});
			const fonts = await loadScriptFonts();
			const signed = await render(sourceBytes, manifest, {
				fonts,
				verifyOrigin: window.location.origin,
			});
			if (!cancelled) {
				setBytes(signed);
				setMessage("");
			}
		})().catch((caught: unknown) => {
			if (cancelled) return;
			setMessage(
				caught instanceof Error
					? caught.message
					: "The signed PDF could not be prepared.",
			);
		});
		return () => {
			cancelled = true;
		};
	}, [context]);

	const file = useMemo(() => (bytes ? pdfBlob(bytes) : null), [bytes]);

	useEffect(() => {
		const node = scrollerRef.current;
		if (!node) return;
		const measure = () => {
			setFrame({
				width: Math.max(280, node.clientWidth - 48),
				height: Math.max(280, node.clientHeight - 48),
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="flex h-svh flex-col bg-background">
			<header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-3">
				<h1 className="text-lg font-semibold text-[var(--harbor)]">
					Document signed
				</h1>
				<button
					type="button"
					className="rounded-md bg-[var(--harbor)] px-3 py-2 text-sm text-white disabled:opacity-40"
					disabled={!bytes}
					onClick={() => {
						if (bytes) downloadPdf(bytes, context.fileName);
					}}
				>
					Download PDF
				</button>
				<ZoomControls zoom={zoom} onZoom={setZoom} />
				<Link to="/" className="text-sm text-[var(--harbor)]">
					Back home
				</Link>
			</header>
			{message ? (
				<p className="px-3 py-3 text-sm text-muted-foreground">{message}</p>
			) : null}
			<div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto">
				{file ? (
					<Document
						file={file}
						suspense={false}
						loading={null}
						onLoadSuccess={(loaded) => setPageCount(loaded.numPages)}
					>
						<div className="flex flex-col items-center gap-6 px-6 py-6">
							{Array.from({ length: pageCount }, (_, index) => (
								<Page
									key={pageIndexKey(index)}
									pageNumber={index + 1}
									width={signedPageWidth(context, index, zoom, frame)}
									devicePixelRatio={cappedDevicePixelRatio()}
									renderTextLayer={false}
									renderAnnotationLayer={false}
									suspense={false}
									loading={null}
								/>
							))}
						</div>
					</Document>
				) : null}
			</div>
		</div>
	);
}

function SignerField({
	field,
	viewW,
	viewH,
	color,
	name,
	value,
	focused,
	onSignature,
	onText,
	onCheck,
}: {
	field: FieldInput;
	viewW: number;
	viewH: number;
	color: string;
	name: string;
	value: FieldValue | undefined;
	focused: boolean;
	onSignature: () => void;
	onText: (text: string) => void;
	onCheck: (checked: boolean) => void;
}) {
	const box = {
		left: `${microToPercent(field.x)}%`,
		top: `${microToPercent(field.y)}%`,
		width: `${microToPercent(field.w)}%`,
		height: `${microToPercent(field.h)}%`,
	};
	const chrome = {
		borderColor: color,
		borderStyle: field.required ? "solid" : "dashed",
		borderWidth: focused ? 2 : 1,
		background: "rgba(255,255,255,0.35)",
	} as const;

	return (
		<div data-field-id={field.id} className="absolute z-20" style={box}>
			{field.required ? (
				<Asterisk
					aria-hidden
					className="absolute -top-2 -right-2 size-3"
					color={color}
				/>
			) : null}
			{field.kind === "signature" || field.kind === "initials" ? (
				<button
					type="button"
					className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-sm border text-xs text-foreground"
					style={chrome}
					onClick={onSignature}
				>
					{value?.signature ? (
						<FieldInk field={field} value={value} viewW={viewW} viewH={viewH} />
					) : (
						FIELD_LABEL[field.kind]
					)}
				</button>
			) : null}
			{field.kind === "text" ? (
				<input
					aria-label={FIELD_LABEL[field.kind]}
					value={value?.text ?? ""}
					maxLength={limits.textFieldChars}
					className="h-full w-full rounded-sm border px-1 text-center text-xs text-foreground outline-none"
					style={chrome}
					onFocus={(event) => {
						const length = event.currentTarget.value.length;
						event.currentTarget.setSelectionRange(length, length);
					}}
					onChange={(event) => onText(event.target.value)}
				/>
			) : null}
			{field.kind === "checkbox" ? (
				<button
					type="button"
					aria-pressed={value?.checked === true}
					aria-label={FIELD_LABEL[field.kind]}
					className="flex h-full w-full items-center justify-center rounded-sm border"
					style={chrome}
					onClick={() => onCheck(value?.checked !== true)}
				>
					{value?.checked ? (
						<FieldInk field={field} value={value} viewW={viewW} viewH={viewH} />
					) : null}
				</button>
			) : null}
			{field.kind === "full_name" ? (
				<p
					className="flex h-full w-full items-center justify-center overflow-hidden rounded-sm border px-1 text-xs text-foreground"
					style={chrome}
				>
					{name || "Signer"}
				</p>
			) : null}
			{field.kind === "date_signed" ? (
				<p
					className="flex h-full w-full items-center justify-center overflow-hidden rounded-sm border px-1 text-center text-[10px] text-muted-foreground"
					style={chrome}
				>
					{formatSignedAt(Date.now())}
				</p>
			) : null}
		</div>
	);
}

function FieldInk({
	field,
	value,
	viewW,
	viewH,
}: {
	field: FieldInput;
	value: FieldValue;
	viewW: number;
	viewH: number;
}) {
	return <InkGraphic field={field} value={value} viewW={viewW} viewH={viewH} />;
}

function PriorInk({
	field,
	value,
	viewW,
	viewH,
}: {
	field: FieldInput;
	value: FieldValue;
	viewW: number;
	viewH: number;
}) {
	return (
		<div
			className="absolute"
			style={{
				left: `${microToPercent(field.x)}%`,
				top: `${microToPercent(field.y)}%`,
				width: `${microToPercent(field.w)}%`,
				height: `${microToPercent(field.h)}%`,
			}}
		>
			<InkGraphic field={field} value={value} viewW={viewW} viewH={viewH} />
		</div>
	);
}

function InkGraphic({
	field,
	value,
	viewW,
	viewH,
}: {
	field: FieldInput;
	value: FieldValue;
	viewW: number;
	viewH: number;
}) {
	if (value.signature?.kind === "drawn") {
		const fieldW = Math.max(1, (field.w / 1_000_000) * viewW);
		const fieldH = Math.max(1, (field.h / 1_000_000) * viewH);
		const groups = inkFractions(
			value.signature.box,
			unpackStrokes(value.signature.strokes),
			fieldW,
			fieldH,
		);
		const stroke = inkStrokeWidth(value.signature.box, fieldW, fieldH);
		return (
			<svg viewBox={`0 0 ${fieldW} ${fieldH}`} className="h-full w-full" aria-hidden>
				<title>Signature</title>
				{groups.map((group) => (
					<polyline
						key={group.map((point) => `${point.x},${point.y}`).join(" ")}
						points={group
							.map((point) => `${point.x * fieldW},${point.y * fieldH}`)
							.join(" ")}
						fill="none"
						stroke="#12344A"
						strokeWidth={stroke}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				))}
			</svg>
		);
	}
	if (value.signature?.kind === "typed") {
		return (
			<FittedScript
				text={value.signature.text}
				family={SCRIPT_FACE[value.signature.font].family}
				className="absolute inset-0 text-foreground"
			/>
		);
	}
	if (value.checked) {
		const points = checkFractions()
			.map((point) => `${point.x},${point.y}`)
			.join(" ");
		return (
			<svg viewBox="0 0 1 1" className="h-full w-full" aria-hidden>
				<title>Checkmark</title>
				<polyline
					points={points}
					fill="none"
					stroke="#12344A"
					strokeWidth="0.12"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}
	if (value.text) {
		return (
			<p className="flex h-full w-full items-center justify-center overflow-hidden px-1 text-center text-xs text-foreground">
				{value.text}
			</p>
		);
	}
	return null;
}

function fieldFilled(
	field: FieldInput,
	values: readonly FieldValue[],
): boolean {
	if (field.kind === "date_signed" || field.kind === "full_name") return true;
	const value = values.find((item) => item.fieldId === field.id);
	if (!value) return false;
	if (field.kind === "signature" || field.kind === "initials") {
		return value.signature !== undefined;
	}
	if (field.kind === "checkbox") return value.checked === true;
	return (value.text ?? "").trim().length > 0;
}

function upsert(values: readonly FieldValue[], next: FieldValue): FieldValue[] {
	const rest = values.filter((item) => item.fieldId !== next.fieldId);
	return [...rest, next];
}

const ZOOM_PERCENTS = [50, 75, 100, 125, 150, 200] as const;
const CSS_PX_PER_PT = 96 / 72;

type SignZoom =
	| { mode: "fit-width" }
	| { mode: "fit-page" }
	| { mode: "percent"; percent: number };

function ZoomControls({
	zoom,
	onZoom,
}: {
	zoom: SignZoom;
	onZoom: (zoom: SignZoom) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				aria-pressed={zoom.mode === "fit-width"}
				className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent aria-pressed:bg-secondary"
				onClick={() => onZoom({ mode: "fit-width" })}
			>
				Fit width
			</button>
			<button
				type="button"
				aria-pressed={zoom.mode === "fit-page"}
				className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent aria-pressed:bg-secondary"
				onClick={() => onZoom({ mode: "fit-page" })}
			>
				Fit page
			</button>
			<label className="text-sm text-foreground">
				<span className="sr-only">Zoom</span>
				<select
					className="rounded-md border border-border bg-background px-2 py-1"
					value={zoom.mode === "percent" ? String(zoom.percent) : ""}
					onChange={(event) =>
						onZoom({
							mode: "percent",
							percent: Number(event.target.value),
						})
					}
				>
					<option value="" disabled>
						Zoom
					</option>
					{ZOOM_PERCENTS.map((percent) => (
						<option key={percent} value={percent}>
							{percent}%
						</option>
					))}
				</select>
			</label>
		</div>
	);
}

function pagePixels(
	viewW: number,
	viewH: number,
	zoom: SignZoom,
	frame: { width: number; height: number },
): { width: number; height: number } {
	if (!(viewW > 0) || !(viewH > 0)) return { width: 1, height: 1 };
	if (zoom.mode === "fit-width") {
		const width = Math.max(1, Math.floor(frame.width));
		return {
			width,
			height: Math.max(1, Math.floor(width * (viewH / viewW))),
		};
	}
	if (zoom.mode === "fit-page") {
		const scale = Math.min(frame.width / viewW, frame.height / viewH);
		return {
			width: Math.max(1, Math.floor(viewW * scale)),
			height: Math.max(1, Math.floor(viewH * scale)),
		};
	}
	const factor = CSS_PX_PER_PT * (zoom.percent / 100);
	return {
		width: Math.max(1, Math.floor(viewW * factor)),
		height: Math.max(1, Math.floor(viewH * factor)),
	};
}

function signedPageWidth(
	context: SigningContext,
	index: number,
	zoom: SignZoom,
	frame: { width: number; height: number },
): number {
	const page = context.upload.geometry[index];
	if (!page) return pagePixels(612, 792, zoom, frame).width;
	const { viewW, viewH } = viewSize(page);
	return pagePixels(viewW, viewH, zoom, frame).width;
}

function pageIndexKey(index: number): string {
	return `sign-page-${index}`;
}

function cappedDevicePixelRatio(): number {
	if (typeof window === "undefined") return 1;
	return Math.min(window.devicePixelRatio || 1, 2);
}

function pdfBlob(bytes: Uint8Array): Blob {
	const copy = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copy).set(bytes);
	return new Blob([copy], { type: "application/pdf" });
}

function downloadPdf(bytes: Uint8Array, fileName: string): void {
	const blob = pdfBlob(bytes);
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${fileName.replace(/\.pdf$/i, "")}-signed.pdf`;
	link.click();
	URL.revokeObjectURL(url);
}
