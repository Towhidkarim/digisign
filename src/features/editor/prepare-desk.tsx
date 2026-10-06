import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";

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
import { Button } from "#/components/ui/button.tsx";
import { limits } from "#/core/limits.ts";
import { displayTitle } from "#/features/dashboard/format.ts";
import { DeskDrag } from "#/features/editor/desk-drag.tsx";
import {
	type Draft,
	discardPrepareDraft,
	getDraft,
	hydrateDraft,
	initUpload,
	loadServerDraft,
	publishDocument,
	resumeServerDraft,
	saveLayout,
	savePreparation,
	saveSigners,
} from "#/features/editor/draft.ts";
import { PageStage, type Zoom } from "#/features/editor/page-stage.tsx";
import {
	createEditorState,
	editorReducer,
	SIGNER_COLORS,
	toSaveLayout,
} from "#/features/editor/reducer.ts";
import { SignerRail } from "#/features/editor/signer-rail.tsx";
import { PdfLoadError, pdfMessages } from "#/pdf/load.ts";

const PERCENTS = [50, 75, 100, 125, 150, 200] as const;

export function PrepareDesk() {
	const fileRef = useRef<HTMLInputElement>(null);
	const dragDepth = useRef(0);
	const requestedId = useSearch({
		from: "/prepare",
		select: (search) => search.documentId,
	});
	const [over, setOver] = useState(false);
	const [session, setSession] = useState<Draft>({
		fileName: "",
		bytes: null,
		upload: null,
		signers: [],
		layout: null,
	});
	const [resume, setResume] = useState<Draft | null>(null);
	const [phase, setPhase] = useState<"idle" | "reading" | "opening">("idle");
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		if (requestedId) {
			setPhase("opening");
			void resumeServerDraft(requestedId).then((result) => {
				if (cancelled) return;
				setPhase("idle");
				if ("error" in result) {
					setError(result.error);
					return;
				}
				setSession({ ...result, bytes: result.bytes });
			});
			return () => {
				cancelled = true;
			};
		}
		const stored = hydrateDraft();
		const storedId = stored.upload?.documentId;
		if (!storedId) return;
		void loadServerDraft(storedId).then((result) => {
			if (cancelled) return;
			const currentId = getDraft().upload?.documentId;
			if (currentId && currentId !== storedId) return;
			if ("error" in result || result.status !== "draft") {
				discardPrepareDraft();
				return;
			}
			if (stored.bytes) setResume({ ...stored, bytes: stored.bytes });
			else setSession({ ...stored });
		});
		return () => {
			cancelled = true;
		};
	}, [requestedId]);

	function takeFile(file: File | undefined) {
		if (!file || phase !== "idle") return;
		const pdf =
			file.type === "application/pdf" ||
			file.name.toLowerCase().endsWith(".pdf");
		if (!pdf) {
			setError("Choose a PDF.");
			return;
		}
		void openFile(file);
	}

	async function openFile(file: File) {
		setError("");
		setPhase("reading");
		try {
			if (file.size > limits.pdfSizeBytes) {
				throw new PdfLoadError(pdfMessages.tooBig);
			}
			const bytes = new Uint8Array(await file.arrayBuffer());
			await initUpload({ name: file.name, bytes });
			setSession({ ...getDraft() });
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : pdfMessages.unreadable,
			);
		} finally {
			setPhase("idle");
		}
	}

	const ready = session.upload !== null && session.bytes !== null;

	return (
		<div className="flex h-dvh flex-col bg-background text-foreground">
			<input
				id="prepare-pdf"
				ref={fileRef}
				type="file"
				accept="application/pdf,.pdf"
				className="sr-only"
				disabled={phase !== "idle"}
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					takeFile(file);
				}}
			/>
			{ready && session.upload && session.bytes ? (
				<Editor
					key={session.upload.documentId}
					fileName={session.fileName}
					bytes={session.bytes}
					upload={session.upload}
					signers={session.signers}
					layout={session.layout}
					onReplace={() => fileRef.current?.click()}
					viewError={error}
				/>
			) : (
				<main className="flex flex-1 flex-col px-6 pt-6 md:px-10 md:pt-10">
					<Link
						to="/dashboard"
						className="text-sm font-medium text-primary no-underline hover:text-primary"
					>
						Dashboard
					</Link>
					<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center pb-16">
						<h1 className="text-[clamp(1.7rem,3vw,2.1rem)] font-semibold tracking-tight">
							Choose a PDF
						</h1>
						<p className="mt-3 max-w-[42ch] leading-relaxed text-muted-foreground">
							Place the fields, name who signs and in what order, then send.
							Until you send, the document stays a draft.
						</p>
						{session.upload && !session.bytes ? (
							<p className="mt-4 max-w-[42ch] text-sm text-muted-foreground">
								This document was too large to keep in the tab. Choose the PDF
								again.
							</p>
						) : null}
						<label
							htmlFor="prepare-pdf"
							onDragEnter={(event) => {
								event.preventDefault();
								dragDepth.current += 1;
								setOver(true);
							}}
							onDragOver={(event) => {
								event.preventDefault();
								event.dataTransfer.dropEffect = "copy";
							}}
							onDragLeave={() => {
								dragDepth.current -= 1;
								if (dragDepth.current <= 0) {
									dragDepth.current = 0;
									setOver(false);
								}
							}}
							onDrop={(event) => {
								event.preventDefault();
								dragDepth.current = 0;
								setOver(false);
								takeFile(event.dataTransfer.files[0]);
							}}
							className={
								over
									? "mt-8 flex min-h-52 cursor-pointer flex-col justify-center rounded-lg border border-dashed border-primary bg-accent px-6 py-10"
									: "mt-8 flex min-h-52 cursor-pointer flex-col justify-center rounded-lg border border-dashed border-border bg-card px-6 py-10"
							}
						>
							<p className="text-lg font-medium">
								{phase === "opening"
									? "Opening the draft…"
									: phase === "reading"
										? "Reading the PDF…"
										: over
											? "Drop it to open"
											: "Drop a PDF here"}
							</p>
							<p className="mt-2 max-w-[36ch] text-sm text-muted-foreground">
								Or click to choose a file from this computer.
							</p>
						</label>
						{resume?.upload && resume.bytes && !requestedId ? (
							<button
								type="button"
								className="mt-4 w-fit text-sm font-medium text-primary"
								disabled={phase !== "idle"}
								onClick={() => setSession({ ...resume, bytes: resume.bytes })}
							>
								Continue {displayTitle(resume.fileName) || "draft"}
							</button>
						) : null}
						{error ? (
							<p
								className="mt-4 max-w-[42ch] text-sm text-destructive"
								role="alert"
							>
								{error}
							</p>
						) : null}
					</div>
				</main>
			)}
		</div>
	);
}

function Editor({
	fileName,
	bytes,
	upload,
	signers,
	layout,
	onReplace,
	viewError,
}: {
	fileName: string;
	bytes: Uint8Array;
	upload: NonNullable<Draft["upload"]>;
	signers: Draft["signers"];
	layout: Draft["layout"];
	onReplace: () => void;
	viewError: string;
}) {
	const [state, dispatch] = useReducer(
		editorReducer,
		{ upload, signers, layout },
		(init) =>
			createEditorState({
				documentId: init.upload.documentId,
				geometry: init.upload.geometry,
				signers: init.signers,
				fields:
					init.layout?.documentId === init.upload.documentId
						? init.layout.fields
						: [],
				layoutVersion:
					init.layout?.documentId === init.upload.documentId
						? init.layout.layoutVersion
						: 0,
			}),
	);
	const navigate = useNavigate();
	const [sent, setSent] = useState(false);
	const [sentOpen, setSentOpen] = useState(false);
	const [sending, setSending] = useState(false);
	const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | "">(
		"",
	);
	const [invited, setInvited] = useState<
		{ id: string; name: string; email: string }[]
	>([]);
	const [zoom, setZoom] = useState<Zoom>({ mode: "fit-width" });
	const [pageNumber, setPageNumber] = useState(1);
	const [drawnError, setDrawnError] = useState("");
	const [notice, setNotice] = useState("");
	const file = useMemo(
		() => new Blob([bytes.slice()], { type: "application/pdf" }),
		[bytes],
	);
	const stateRef = useRef(state);
	stateRef.current = state;
	const versionRef = useRef(state.layoutVersion);
	const saveChain = useRef(Promise.resolve());
	const sendingRef = useRef(false);
	const lockedRef = useRef(false);

	const enqueueSave = useCallback(
		(snapshot: {
			documentId: string;
			signers: typeof state.signers;
			fields: typeof state.fields;
		}) => {
			const noteVersion = (layoutVersion: number) => {
				versionRef.current = layoutVersion;
				if (layoutVersion !== stateRef.current.layoutVersion) {
					dispatch({ type: "sync-version", layoutVersion });
				}
			};
			const run = saveChain.current.then(async () => {
				const saved = await savePreparation({
					documentId: snapshot.documentId,
					layoutVersion: versionRef.current,
					signers: snapshot.signers,
					fields: snapshot.fields,
				});
				if (!("error" in saved)) {
					noteVersion(saved.layoutVersion);
					return saved;
				}
				if (!saved.error.includes("updated")) return saved;
				const fresh = await loadServerDraft(snapshot.documentId);
				if ("error" in fresh) return saved;
				const retry = await savePreparation({
					documentId: snapshot.documentId,
					layoutVersion: fresh.layoutVersion,
					signers: snapshot.signers,
					fields: snapshot.fields,
				});
				if (!("error" in retry)) noteVersion(retry.layoutVersion);
				return retry;
			});
			saveChain.current = run.then(
				() => undefined,
				() => undefined,
			);
			return run;
		},
		[],
	);

	useEffect(() => {
		if (lockedRef.current) return;
		const snapshot = {
			documentId: state.documentId,
			signers: state.signers,
			fields: state.fields,
		};
		let cancelled = false;
		setSaveState("saving");
		const id = window.setTimeout(() => {
			if (cancelled || sendingRef.current || lockedRef.current) return;
			void enqueueSave(snapshot).then((result) => {
				if (cancelled || sendingRef.current || lockedRef.current) return;
				if ("error" in result) {
					if (result.error.includes("no longer be edited")) {
						lockedRef.current = true;
						setSent(true);
						setSentOpen(true);
						setSaveState("saved");
						return;
					}
					setSaveState("error");
					setNotice(result.error);
					return;
				}
				setSaveState("saved");
				setNotice("");
			});
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(id);
		};
	}, [enqueueSave, state.documentId, state.fields, state.signers]);

	useEffect(() => {
		function flush() {
			if (lockedRef.current || sendingRef.current) return;
			const current = stateRef.current;
			saveSigners(current.signers);
			saveLayout(toSaveLayout(current));
			void enqueueSave({
				documentId: current.documentId,
				signers: current.signers,
				fields: current.fields,
			});
		}
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, [enqueueSave]);

	const nextName = invited[0]?.name.trim() ?? "";

	async function leave() {
		if (!lockedRef.current) {
			const current = stateRef.current;
			setSaveState("saving");
			const saved = await enqueueSave({
				documentId: current.documentId,
				signers: current.signers,
				fields: current.fields,
			});
			if ("error" in saved && !saved.error.includes("no longer be edited")) {
				setSaveState("error");
				setNotice(saved.error);
				return;
			}
		}
		await navigate({
			to: "/documents/$documentId",
			params: { documentId: stateRef.current.documentId },
		});
	}

	async function send() {
		if (lockedRef.current || sendingRef.current) return;
		sendingRef.current = true;
		setSending(true);
		setNotice("");
		const current = stateRef.current;
		saveSigners(current.signers);
		saveLayout(toSaveLayout(current));
		const saved = await enqueueSave({
			documentId: current.documentId,
			signers: current.signers,
			fields: current.fields,
		});
		if ("error" in saved) {
			sendingRef.current = false;
			setSending(false);
			setSaveState("error");
			setNotice(saved.error);
			return;
		}
		const published = await publishDocument(current.documentId);
		if ("error" in published) {
			sendingRef.current = false;
			setSending(false);
			setNotice(published.error);
			return;
		}
		lockedRef.current = true;
		setSent(true);
		setSentOpen(true);
		setSaveState("saved");
		setSending(false);
		sendingRef.current = false;
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const fresh = await loadServerDraft(current.documentId);
			if (!("error" in fresh)) {
				const waiting = fresh.signers.filter(
					(signer) => signer.status === "invited",
				);
				if (waiting.length > 0) {
					setInvited(
						waiting.map((signer) => ({
							id: signer.id,
							name: signer.name,
							email: signer.email,
						})),
					);
					break;
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 750));
		}
	}

	return (
		<>
			<header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 md:px-4">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => void leave()}
				>
					Close
				</Button>
				<p className="min-w-0 max-w-[20ch] truncate text-sm font-medium sm:max-w-[32ch]">
					{fileName || "Document"}
				</p>
				<p
					className={
						saveState === "error"
							? "text-sm text-destructive"
							: "text-sm text-muted-foreground"
					}
				>
					{sent
						? ""
						: saveState === "saving"
							? "Saving draft…"
							: saveState === "saved"
								? "Draft saved"
								: saveState === "error"
									? "Draft not saved"
									: ""}
				</p>
				<div className="ml-auto flex flex-wrap items-center gap-1">
					<p className="px-1 text-sm text-muted-foreground tabular-nums">
						Page {pageNumber} of {upload.pageCount}
					</p>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-pressed={zoom.mode === "fit-width"}
						className="aria-pressed:bg-secondary"
						onClick={() => setZoom({ mode: "fit-width" })}
					>
						Fit width
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-pressed={zoom.mode === "fit-page"}
						className="aria-pressed:bg-secondary"
						onClick={() => setZoom({ mode: "fit-page" })}
					>
						Fit page
					</Button>
					<label className="text-sm text-foreground">
						<span className="sr-only">Zoom</span>
						<select
							className="h-8 rounded-md border border-border bg-background px-2"
							value={zoom.mode === "percent" ? String(zoom.percent) : ""}
							onChange={(event) =>
								setZoom({
									mode: "percent",
									percent: Number(event.target.value),
								})
							}
						>
							<option value="" disabled>
								Zoom
							</option>
							{PERCENTS.map((percent) => (
								<option key={percent} value={percent}>
									{percent}%
								</option>
							))}
						</select>
					</label>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={sent || state.past.length === 0}
						onClick={() => dispatch({ type: "undo" })}
					>
						Undo
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={sent || state.future.length === 0}
						onClick={() => dispatch({ type: "redo" })}
					>
						Redo
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={sending}
						onClick={onReplace}
					>
						Choose another PDF
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={sent || sending}
						onClick={() => void send()}
					>
						{sending ? "Sending…" : "Send for signature"}
					</Button>
				</div>
			</header>
			{viewError || drawnError ? (
				<p
					className="border-b border-border px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{viewError || drawnError}
				</p>
			) : null}
			{notice ? (
				<p
					className="border-b border-border px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{notice}
				</p>
			) : null}
			{sent ? (
				<p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
					This document can no longer be edited.{" "}
					<button
						type="button"
						className="font-medium text-primary underline-offset-2 hover:underline"
						onClick={() => void leave()}
					>
						Open it
					</button>
				</p>
			) : null}
			<DeskDrag
				signers={state.signers}
				fieldColor={
					state.signers.find((signer) => signer.id === state.selectedSignerId)
						?.color ?? SIGNER_COLORS[0]
				}
				dispatch={dispatch}
			>
				<div
					className="flex min-h-0 flex-1 flex-row"
					inert={sent ? true : undefined}
				>
					<SignerRail
						signers={state.signers}
						selectedSignerId={state.selectedSignerId}
						dispatch={dispatch}
					/>
					<div className="flex min-h-0 min-w-0 flex-1">
						<Suspense
							fallback={
								<p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
									Opening the PDF…
								</p>
							}
						>
							<PageStage
								file={file}
								state={state}
								zoom={zoom}
								dispatch={dispatch}
								onPageChange={setPageNumber}
								onViewError={setDrawnError}
							/>
						</Suspense>
					</div>
				</div>
			</DeskDrag>
			<AlertDialog open={sentOpen} onOpenChange={setSentOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Sent for signature</AlertDialogTitle>
						<AlertDialogDescription>
							{nextName
								? `${nextName} is next. This document can no longer be edited. Open it to copy their signing link.`
								: "This document can no longer be edited. The next person is invited in order. Open it to copy their signing link."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Stay here</AlertDialogCancel>
						<AlertDialogAction onClick={() => void leave()}>
							Open this document
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
