import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

import type { SignatureInput } from "#/core/contracts/index.ts";
import { limits } from "#/core/limits.ts";
import {
	CAPTURE_BOX,
	drawnSignature,
	pointsToStrokes,
	type ScriptFont,
	strokesToCanvasPoints,
	typedSignature,
	unpackStrokes,
} from "#/features/sign/capture.ts";
import { FittedScript } from "#/features/sign/fitted-script.tsx";
import {
	forgetSignature,
	loadSavedSignature,
	rememberSignature,
} from "#/features/sign/saved-signature.ts";
import { installScriptFaces, SCRIPT_FACE } from "#/pdf/fonts.ts";

/** The pen follows the pad's text color, which stays dark ink on white paper in either theme. */
function ink(frame: HTMLElement): string {
	return getComputedStyle(frame).color;
}

export function CaptureSheet({
	title,
	existing,
	onCancel,
	onUse,
}: {
	title: string;
	existing?: SignatureInput;
	onCancel: () => void;
	onUse: (signature: SignatureInput) => void;
}) {
	const [mode, setMode] = useState<"drawn" | "typed">(
		existing?.kind === "typed" ? "typed" : "drawn",
	);
	const [typed, setTyped] = useState(
		existing?.kind === "typed" ? existing.text : "",
	);
	const [font, setFont] = useState<ScriptFont>(
		existing?.kind === "typed" ? existing.font : "script-1",
	);
	const [drawnSeed, setDrawnSeed] = useState<string | null>(
		existing?.kind === "drawn" ? existing.strokes : null,
	);
	const [saved, setSaved] = useState<SignatureInput | null>(null);
	const [remember, setRemember] = useState(false);
	const [error, setError] = useState("");
	const [fontsReady, setFontsReady] = useState(false);

	useEffect(() => {
		setSaved(loadSavedSignature());
		let cancelled = false;
		void installScriptFaces().then(() => {
			if (!cancelled) setFontsReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	function accept(signature: SignatureInput) {
		if (remember) rememberSignature(signature);
		onUse(signature);
	}

	function fillFromSaved(signature: SignatureInput) {
		if (signature.kind === "typed") {
			setMode("typed");
			setTyped(signature.text);
			setFont(signature.font);
			return;
		}
		setMode("drawn");
		setDrawnSeed(signature.strokes);
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim p-4 sm:items-center">
			<div className="flex w-full max-w-xl flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground shadow-lg">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-semibold text-primary">{title}</h2>
					<button
						type="button"
						className="text-sm text-muted-foreground hover:underline"
						onClick={onCancel}
					>
						Cancel
					</button>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						aria-pressed={mode === "drawn"}
						className="rounded-md px-3 py-1.5 text-sm aria-pressed:bg-accent"
						onClick={() => setMode("drawn")}
					>
						Draw
					</button>
					<button
						type="button"
						aria-pressed={mode === "typed"}
						className="rounded-md px-3 py-1.5 text-sm aria-pressed:bg-accent"
						onClick={() => setMode("typed")}
					>
						Type
					</button>
				</div>
				{saved ? (
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<button
							type="button"
							className="rounded-md border border-input px-3 py-1.5"
							onClick={() => fillFromSaved(saved)}
						>
							Use saved signature
						</button>
						<button
							type="button"
							className="text-muted-foreground hover:underline"
							onClick={() => {
								forgetSignature();
								setSaved(null);
							}}
						>
							Forget
						</button>
					</div>
				) : null}
				{mode === "drawn" ? (
					<DrawPad
						seed={drawnSeed}
						onUse={(signature) => accept(signature)}
						onError={setError}
					/>
				) : (
					<div className="flex flex-col gap-3">
						<input
							value={typed}
							maxLength={limits.typedSignatureChars}
							placeholder="Type your name"
							className="h-12 rounded-md border border-input px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onChange={(event) => setTyped(event.target.value)}
						/>
						<div
							className="on-paper relative aspect-[3/1] w-full rounded-md border border-input bg-card text-foreground"
							aria-live="polite"
						>
							<FittedScript
								text={typed.trim() || "Your signature"}
								family={
									fontsReady ? SCRIPT_FACE[font].family : "var(--font-sans)"
								}
								className={`absolute inset-0 px-4 py-3 ${typed.trim() ? "text-foreground" : "text-muted-foreground"}`}
							/>
						</div>
						<div
							className="grid grid-cols-2 gap-2"
							role="listbox"
							aria-label="Signature font"
						>
							{(Object.keys(SCRIPT_FACE) as ScriptFont[]).map((name) => (
								<button
									key={name}
									type="button"
									role="option"
									aria-selected={font === name}
									className="relative h-14 overflow-hidden rounded-md border border-input aria-selected:border-primary aria-selected:bg-accent"
									onClick={() => setFont(name)}
								>
									<FittedScript
										text={typed.trim() || SCRIPT_FACE[name].label}
										family={
											fontsReady ? SCRIPT_FACE[name].family : "var(--font-sans)"
										}
										className="absolute inset-0 px-3 py-2 text-foreground"
									/>
								</button>
							))}
						</div>
						<button
							type="button"
							className="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40"
							disabled={typed.trim().length === 0}
							onClick={() => {
								try {
									accept(typedSignature(typed, font));
								} catch (caught) {
									setError(
										caught instanceof Error
											? caught.message
											: "That signature could not be saved.",
									);
								}
							}}
						>
							Use this signature
						</button>
					</div>
				)}
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						checked={remember}
						onChange={(event) => setRemember(event.target.checked)}
					/>
					Remember on this device
				</label>
				{error ? <p className="text-sm text-destructive">{error}</p> : null}
			</div>
		</div>
	);
}

function DrawPad({
	seed,
	onUse,
	onError,
}: {
	seed: string | null;
	onUse: (signature: SignatureInput) => void;
	onError: (message: string) => void;
}) {
	const frameRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const padRef = useRef<SignaturePad | null>(null);
	const packedRef = useRef<string | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const frame = frameRef.current;
		if (!canvas || !frame) return;
		const pad = new SignaturePad(canvas, {
			penColor: ink(frame),
			minWidth: 0.8,
			maxWidth: 2.4,
		});
		padRef.current = pad;
		packedRef.current = seed;
		const redraw = () => {
			const width = frame.clientWidth;
			const height = Math.max(1, Math.round(width / 3));
			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			const context = canvas.getContext("2d");
			context?.setTransform(ratio, 0, 0, ratio, 0, 0);
			pad.clear();
			if (!packedRef.current) return;
			const groups = strokesToCanvasPoints(
				unpackStrokes(packedRef.current),
				width,
				height,
			);
			pad.fromData(
				groups.map((points) => ({
					penColor: ink(frame),
					dotSize: 0,
					minWidth: 0.8,
					maxWidth: 2.4,
					velocityFilterWeight: 0.7,
					compositeOperation: "source-over" as const,
					points,
				})),
			);
		};
		redraw();
		const observer = new ResizeObserver(redraw);
		observer.observe(frame);
		return () => {
			observer.disconnect();
			pad.off();
		};
	}, [seed]);

	function rememberInk() {
		const pad = padRef.current;
		const canvas = canvasRef.current;
		const frame = frameRef.current;
		if (!pad || !canvas || !frame || pad.isEmpty()) {
			packedRef.current = null;
			return;
		}
		const width = frame.clientWidth;
		const height = Math.max(1, Math.round(width / 3));
		try {
			packedRef.current = drawnSignature(
				pointsToStrokes(pad.toData(), width, height),
			).strokes;
		} catch (caught) {
			packedRef.current = null;
			onError(
				caught instanceof Error
					? caught.message
					: "That drawing could not be kept.",
			);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div
				ref={frameRef}
				className="on-paper overflow-hidden rounded-md border border-input bg-card text-foreground"
			>
				<canvas
					ref={canvasRef}
					aria-label="Draw a signature"
					className="block w-full touch-none"
					onPointerUp={rememberInk}
					onPointerLeave={rememberInk}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				The drawing area stays {CAPTURE_BOX.w / CAPTURE_BOX.h}:1.
			</p>
			<div className="flex gap-2">
				<button
					type="button"
					className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:underline"
					onClick={() => {
						padRef.current?.clear();
						packedRef.current = null;
					}}
				>
					Clear
				</button>
				<button
					type="button"
					className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
					onClick={() => {
						rememberInk();
						const packed = packedRef.current;
						if (!packed) {
							onError("Draw a signature first.");
							return;
						}
						onUse({
							kind: "drawn",
							box: { w: CAPTURE_BOX.w, h: CAPTURE_BOX.h },
							strokes: packed,
						});
					}}
				>
					Use this signature
				</button>
			</div>
		</div>
	);
}
