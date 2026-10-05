import { Link } from "@tanstack/react-router";
import {
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";

import { Button } from "#/components/ui/button.tsx";
import { limits } from "#/core/limits.ts";
import { SignOutButton } from "#/features/auth/auth-form.tsx";
import { DeskDrag } from "#/features/editor/desk-drag.tsx";
import {
	type Draft,
	getDraft,
	hydrateDraft,
	initUpload,
	loadServerDraft,
	publishDocument,
	reissueInvite,
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
	const [session, setSession] = useState<Draft>(() => {
		hydrateDraft();
		return getDraft();
	});
	const [phase, setPhase] = useState<"idle" | "reading">("idle");
	const [error, setError] = useState("");

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
				ref={fileRef}
				type="file"
				accept="application/pdf,.pdf"
				className="sr-only"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void openFile(file);
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
				<main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
					<Link
						to="/"
						className="text-lg font-semibold tracking-tight"
						style={{ color: "var(--harbor)", textDecoration: "none" }}
					>
						DigiSign
					</Link>
					<h1 className="mt-8 text-[1.65rem] font-semibold tracking-tight text-[var(--harbor)]">
						Choose a PDF
					</h1>
					<p className="mt-3 max-w-sm text-muted-foreground">
						The preview stays in this tab. The file is stored for the signers.
					</p>
					{session.upload && !session.bytes ? (
						<p className="mt-4 max-w-sm text-muted-foreground">
							This document was too large to keep in the tab. Choose the PDF
							again.
						</p>
					) : null}
					<Button
						className="mt-6"
						disabled={phase === "reading"}
						onClick={() => fileRef.current?.click()}
					>
						{phase === "reading" ? "Reading the PDF…" : "Choose a PDF"}
					</Button>
					{error ? (
						<p className="mt-4 max-w-sm text-destructive">{error}</p>
					) : null}
					<SignOutButton />
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
	const [sent, setSent] = useState(false);
	const [sending, setSending] = useState(false);
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
		const snapshot = {
			documentId: state.documentId,
			signers: state.signers,
			fields: state.fields,
		};
		let cancelled = false;
		const id = window.setTimeout(() => {
			if (sendingRef.current) return;
			void enqueueSave(snapshot).then((result) => {
				if (cancelled || sendingRef.current) return;
				if (
					"error" in result &&
					!result.error.includes("no longer be edited")
				) {
					setNotice(result.error);
				}
			});
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(id);
		};
	}, [enqueueSave, state.documentId, state.fields, state.signers]);

	useEffect(() => {
		function flush() {
			const current = stateRef.current;
			saveSigners(current.signers);
			saveLayout(toSaveLayout(current));
		}
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, []);

	return (
		<>
			<header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
				<Link
					to="/"
					className="text-lg font-semibold tracking-tight"
					style={{ color: "var(--harbor)", textDecoration: "none" }}
				>
					DigiSign
				</Link>
				<p className="min-w-0 flex-1 truncate text-sm text-foreground">
					{fileName || "Document"}
				</p>
				<p className="text-sm text-muted-foreground">
					Page {pageNumber} of {upload.pageCount}
				</p>
				<div className="flex items-center gap-1">
					<button
						type="button"
						aria-pressed={zoom.mode === "fit-width"}
						className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent aria-pressed:bg-secondary"
						onClick={() => setZoom({ mode: "fit-width" })}
					>
						Fit width
					</button>
					<button
						type="button"
						aria-pressed={zoom.mode === "fit-page"}
						className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent aria-pressed:bg-secondary"
						onClick={() => setZoom({ mode: "fit-page" })}
					>
						Fit page
					</button>
					<label className="text-sm text-foreground">
						<span className="sr-only">Zoom</span>
						<select
							className="rounded-md border border-border bg-background px-2 py-1"
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
				</div>
				<button
					type="button"
					className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent disabled:opacity-40"
					disabled={state.past.length === 0}
					onClick={() => dispatch({ type: "undo" })}
				>
					Undo
				</button>
				<button
					type="button"
					className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent disabled:opacity-40"
					disabled={state.future.length === 0}
					onClick={() => dispatch({ type: "redo" })}
				>
					Redo
				</button>
				<button
					type="button"
					className="rounded-md bg-[var(--harbor)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
					disabled={sent || sending}
					onClick={() => {
						void (async () => {
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
							// The invite goes out through the queue, so the first signer turns
							// "invited" a moment after publish. Look a few times before giving up.
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
							setNotice(
								"Sent for signature. The invite link is printed in the server console.",
							);
							setSent(true);
						})();
					}}
				>
					Send for signature
				</button>
				<button
					type="button"
					className="rounded-md px-2 py-1 text-sm text-[var(--harbor)] hover:underline"
					onClick={onReplace}
				>
					Choose another PDF
				</button>
			</header>
			{viewError || drawnError ? (
				<p className="border-b border-border px-3 py-2 text-sm text-destructive">
					{viewError || drawnError}
				</p>
			) : null}
			{notice ? (
				<p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
					{notice}
				</p>
			) : null}
			{sent ? (
				<section className="border-b border-border px-3 py-3">
					<h2 className="text-sm font-medium">Invite links</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Send link again prints a new link in the server console. This page
						does not keep the link.
					</p>
					<ul className="mt-3 flex flex-col gap-2">
						{invited.map((signer) => (
							<li key={signer.id} className="flex items-center gap-3 text-sm">
								<span className="min-w-0 flex-1 truncate">
									{signer.name || "Signer"} · {signer.email || "No email"}
								</span>
								<button
									type="button"
									className="rounded-md px-2 py-1 text-[var(--harbor)] hover:underline"
									onClick={() => {
										void reissueInvite(signer.id).then((result) => {
											setNotice(
												"error" in result
													? result.error
													: "A new link was printed in the server console.",
											);
										});
									}}
								>
									Send link again
								</button>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<DeskDrag
				signers={state.signers}
				fieldColor={
					state.signers.find((signer) => signer.id === state.selectedSignerId)
						?.color ?? SIGNER_COLORS[0]
				}
				dispatch={dispatch}
			>
				<div className="flex min-h-0 flex-1 flex-row">
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
		</>
	);
}
