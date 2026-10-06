import { useDroppable } from "@dnd-kit/core";
import { Asterisk, X } from "lucide-react";
import {
	type CSSProperties,
	type Dispatch,
	type PointerEvent,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { Document, Page } from "react-pdf";
import { Switch } from "#/components/ui/switch.tsx";
import type { FieldInput } from "#/core/contracts/index.ts";
import {
	cssDeltaToMicro,
	microToPercent,
	type PageGeometry,
	pointerToMicro,
	viewSize,
} from "#/core/coords.ts";
import { setFieldGrabCursor } from "#/features/editor/desk-drag.tsx";
import {
	type EditorAction,
	type EditorSigner,
	type EditorState,
	FIELD_LABEL,
} from "#/features/editor/reducer.ts";
import "#/pdf/setup.ts";

export type Zoom =
	| { mode: "fit-width" }
	| { mode: "fit-page" }
	| { mode: "percent"; percent: number };

const CSS_PX_PER_PT = 96 / 72;

type Corner = "nw" | "ne" | "sw" | "se";

type Gesture =
	| {
			kind: "move";
			id: string;
			originX: number;
			originY: number;
			startX: number;
			startY: number;
			record: boolean;
	  }
	| {
			kind: "resize";
			id: string;
			corner: Corner;
			origin: { x: number; y: number; w: number; h: number };
			record: boolean;
	  };

export function PageStage({
	file,
	state,
	zoom,
	dispatch,
	onPageChange,
	onViewError,
}: {
	file: Blob;
	state: EditorState;
	zoom: Zoom;
	dispatch: Dispatch<EditorAction>;
	onPageChange: (pageNumber: number) => void;
	onViewError: (message: string) => void;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const nodes = useRef(new Map<number, HTMLDivElement>());
	const gesture = useRef<Gesture | null>(null);
	const sizes = useRef(new Map<number, { width: number; height: number }>());
	const [frame, setFrame] = useState({ width: 720, height: 900 });
	const [near, setNear] = useState<ReadonlySet<number>>(() => new Set([0]));
	const dpr = cappedDevicePixelRatio();

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const measure = () => {
			setFrame({
				width: Math.max(1, root.clientWidth - 48),
				height: Math.max(1, root.clientHeight - 48),
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const visible = new Set<number>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const index = Number((entry.target as HTMLElement).dataset.pageIndex);
					if (entry.isIntersecting) visible.add(index);
					else visible.delete(index);
				}
				const first = visible.size > 0 ? Math.min(...visible) : 0;
				onPageChange(first + 1);
				const next = new Set<number>();
				if (visible.size === 0) next.add(0);
				for (const index of visible) next.add(index);
				setNear((current) => (sameNumbers(current, next) ? current : next));
			},
			{ root, rootMargin: "200% 0px" },
		);
		for (const node of nodes.current.values()) observer.observe(node);
		return () => observer.disconnect();
	}, [onPageChange]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				target.closest("input, textarea, select")
			) {
				return;
			}
			const meta = event.ctrlKey || event.metaKey;
			if (meta && event.key.toLowerCase() === "z") {
				event.preventDefault();
				dispatch({ type: event.shiftKey ? "redo" : "undo" });
				return;
			}
			if (meta && event.key.toLowerCase() === "y") {
				event.preventDefault();
				dispatch({ type: "redo" });
				return;
			}
			const selected = state.selectedFieldId;
			if (!selected) return;
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				dispatch({ type: "delete", id: selected });
				return;
			}
			const step = event.shiftKey ? 10 : 1;
			let dx = 0;
			let dy = 0;
			if (event.key === "ArrowLeft") dx = -step;
			else if (event.key === "ArrowRight") dx = step;
			else if (event.key === "ArrowUp") dy = -step;
			else if (event.key === "ArrowDown") dy = step;
			else return;
			const field = state.fields.find((item) => item.id === selected);
			const size = field ? sizes.current.get(field.pageIndex) : undefined;
			if (!field || !size) return;
			event.preventDefault();
			dispatch({
				type: "nudge",
				id: field.id,
				dx: cssDeltaToMicro(dx, size.width),
				dy: cssDeltaToMicro(dy, size.height),
			});
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [dispatch, state.fields, state.selectedFieldId]);

	return (
		<div ref={rootRef} className="min-h-0 flex-1 overflow-auto bg-background">
			<Document
				file={file}
				suspense={false}
				loading={
					<p className="py-16 text-sm text-muted-foreground">
						Opening the PDF…
					</p>
				}
				noData={null}
				error={
					<p className="max-w-sm py-16 text-sm text-destructive">
						This file could not be read as a PDF. Choose another file.
					</p>
				}
				onLoadError={() =>
					onViewError(
						"This file could not be read as a PDF. Choose another file.",
					)
				}
			>
				<div className="flex flex-col items-center gap-6 px-6 py-6">
					{state.geometry.map((page, index) => {
						const size = pagePixels(page, zoom, frame);
						sizes.current.set(index, size);
						return (
							<PageFrame
								key={pageKey(index)}
								index={index}
								size={size}
								drawn={near.has(index)}
								dpr={dpr}
								fields={state.fields.filter(
									(field) => field.pageIndex === index,
								)}
								signers={state.signers}
								selectedFieldId={state.selectedFieldId}
								dispatch={dispatch}
								gesture={gesture}
								nodes={nodes}
							/>
						);
					})}
				</div>
			</Document>
		</div>
	);
}

function PageFrame({
	index,
	size,
	drawn,
	dpr,
	fields,
	signers,
	selectedFieldId,
	dispatch,
	gesture,
	nodes,
}: {
	index: number;
	size: { width: number; height: number };
	drawn: boolean;
	dpr: number;
	fields: FieldInput[];
	signers: readonly EditorSigner[];
	selectedFieldId: string | null;
	dispatch: Dispatch<EditorAction>;
	gesture: RefObject<Gesture | null>;
	nodes: RefObject<Map<number, HTMLDivElement>>;
}) {
	const { setNodeRef, isOver } = useDroppable({
		id: pageKey(index),
		data: { pageIndex: index },
	});

	return (
		<div
			data-page-index={index}
			ref={(node) => {
				setNodeRef(node);
				if (node) nodes.current.set(index, node);
				else nodes.current.delete(index);
			}}
			className={
				isOver
					? "on-paper relative border border-primary bg-card ring-2 ring-primary"
					: "on-paper relative border border-border bg-card"
			}
			style={{ width: size.width, height: size.height }}
			onPointerDown={(event) => {
				const target = event.target;
				if (target instanceof Element && target.closest("[data-field-id]")) {
					return;
				}
				dispatch({ type: "select-field", id: null });
			}}
		>
			{drawn ? (
				<Page
					pageNumber={index + 1}
					width={size.width}
					devicePixelRatio={dpr}
					renderTextLayer={false}
					renderAnnotationLayer={false}
					suspense={false}
					loading={null}
					className="absolute top-0 left-0"
				/>
			) : null}
			<div className="pointer-events-none absolute inset-0 z-10">
				{fields.map((field) => (
					<FieldBox
						key={field.id}
						field={field}
						signer={signers.find((item) => item.id === field.signerId)}
						selected={selectedFieldId === field.id}
						dispatch={dispatch}
						gesture={gesture}
					/>
				))}
			</div>
		</div>
	);
}

function FieldBox({
	field,
	signer,
	selected,
	dispatch,
	gesture,
}: {
	field: FieldInput;
	signer: EditorSigner | undefined;
	selected: boolean;
	dispatch: Dispatch<EditorAction>;
	gesture: RefObject<Gesture | null>;
}) {
	const color = signer?.color ?? "var(--signer-6)";
	const label = FIELD_LABEL[field.kind];
	const name = signer?.name.trim() || "Signer";
	const caption = field.kind === "full_name" ? name : label;

	function pageBox(target: EventTarget | null): HTMLElement | null {
		if (!(target instanceof Element)) return null;
		const page = target.closest("[data-page-index]");
		return page instanceof HTMLElement ? page : null;
	}

	function pointerMicro(event: PointerEvent<HTMLElement>, page: HTMLElement) {
		const rect = page.getBoundingClientRect();
		return {
			x: pointerToMicro(event.clientX, rect.left, rect.width),
			y: pointerToMicro(event.clientY, rect.top, rect.height),
		};
	}

	const toolbarAbove = field.y + field.h > 820_000;

	return (
		<div
			data-field-id={field.id}
			className={
				selected
					? "pointer-events-auto absolute z-20"
					: "pointer-events-auto absolute z-10"
			}
			style={{
				left: `${microToPercent(field.x)}%`,
				top: `${microToPercent(field.y)}%`,
				width: `${microToPercent(field.w)}%`,
				height: `${microToPercent(field.h)}%`,
			}}
		>
			<button
				type="button"
				aria-label={`${label} for ${name}, page ${field.pageIndex + 1}`}
				className="flex h-full w-full cursor-grab items-center justify-center overflow-hidden rounded-sm border px-1 text-center text-xs text-foreground"
				style={{
					borderColor: color,
					borderStyle: field.required ? "solid" : "dashed",
					borderWidth: selected ? 2 : 1,
					background: "color-mix(in oklab, var(--card) 35%, transparent)",
					touchAction: "none",
				}}
				onPointerDown={(event) => {
					event.stopPropagation();
					const page = pageBox(event.currentTarget);
					if (!page) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					setFieldGrabCursor(true);
					const point = pointerMicro(event, page);
					gesture.current = {
						kind: "move",
						id: field.id,
						originX: field.x,
						originY: field.y,
						startX: point.x,
						startY: point.y,
						record: true,
					};
					dispatch({ type: "select-field", id: field.id });
				}}
				onPointerMove={(event) => {
					const current = gesture.current;
					if (!current || current.kind !== "move" || current.id !== field.id) {
						return;
					}
					const page = pageBox(event.currentTarget);
					if (!page) return;
					const point = pointerMicro(event, page);
					dispatch({
						type: "move",
						id: field.id,
						x: current.originX + (point.x - current.startX),
						y: current.originY + (point.y - current.startY),
						record: current.record,
					});
					current.record = false;
				}}
				onPointerUp={() => {
					setFieldGrabCursor(false);
					if (gesture.current?.id === field.id) gesture.current = null;
				}}
				onPointerCancel={() => {
					setFieldGrabCursor(false);
					if (gesture.current?.id === field.id) gesture.current = null;
				}}
			>
				<span className="block truncate">{caption}</span>
			</button>
			{field.required ? (
				<Asterisk
					aria-hidden
					className="pointer-events-none absolute top-0.5 right-0.5 size-3"
					style={{ color }}
				/>
			) : null}
			{selected ? (
				<div
					className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-center rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ${toolbarAbove ? "bottom-full mb-2" : "top-full mt-2"}`}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<label
						htmlFor={`required-${field.id}`}
						className="flex items-center gap-1.5 px-1.5"
					>
						<Switch
							id={`required-${field.id}`}
							size="sm"
							checked={field.required}
							onCheckedChange={(checked) =>
								dispatch({
									type: "set-required",
									id: field.id,
									required: checked === true,
								})
							}
						/>
						<span className="text-xs text-foreground">Required</span>
					</label>
					<span aria-hidden className="mx-1 h-4 w-px bg-border" />
					<button
						type="button"
						aria-label={`Remove ${label}`}
						className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-accent"
						onClick={() => dispatch({ type: "delete", id: field.id })}
					>
						<X className="size-3.5" />
					</button>
				</div>
			) : null}
			{selected
				? (["nw", "ne", "sw", "se"] as const).map((corner) => (
						<button
							key={corner}
							type="button"
							aria-label={`Resize ${label}`}
							className="absolute z-10 size-2.5 rounded-full border-2 bg-card"
							style={{
								borderColor: color,
								touchAction: "none",
								cursor:
									corner === "nw" || corner === "se"
										? "nwse-resize"
										: "nesw-resize",
								...cornerStyle(corner),
							}}
							onPointerDown={(event) => {
								event.stopPropagation();
								event.currentTarget.setPointerCapture(event.pointerId);
								gesture.current = {
									kind: "resize",
									id: field.id,
									corner,
									origin: { x: field.x, y: field.y, w: field.w, h: field.h },
									record: true,
								};
							}}
							onPointerMove={(event) => {
								const current = gesture.current;
								if (
									!current ||
									current.kind !== "resize" ||
									current.id !== field.id
								) {
									return;
								}
								const page = pageBox(event.currentTarget);
								if (!page) return;
								const point = pointerMicro(event, page);
								const next = resized(current.origin, current.corner, point);
								dispatch({
									type: "resize",
									id: field.id,
									...next,
									record: current.record,
								});
								current.record = false;
							}}
							onPointerUp={() => {
								if (gesture.current?.id === field.id) gesture.current = null;
							}}
						/>
					))
				: null}
		</div>
	);
}

function resized(
	origin: { x: number; y: number; w: number; h: number },
	corner: Corner,
	point: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
	const right = origin.x + origin.w;
	const bottom = origin.y + origin.h;
	if (corner === "se") {
		return {
			x: origin.x,
			y: origin.y,
			w: point.x - origin.x,
			h: point.y - origin.y,
		};
	}
	if (corner === "sw") {
		return {
			x: point.x,
			y: origin.y,
			w: right - point.x,
			h: point.y - origin.y,
		};
	}
	if (corner === "ne") {
		return {
			x: origin.x,
			y: point.y,
			w: point.x - origin.x,
			h: bottom - point.y,
		};
	}
	return { x: point.x, y: point.y, w: right - point.x, h: bottom - point.y };
}

function cornerStyle(corner: Corner): CSSProperties {
	if (corner === "nw")
		return { left: 0, top: 0, transform: "translate(-40%, -40%)" };
	if (corner === "ne")
		return { right: 0, top: 0, transform: "translate(40%, -40%)" };
	if (corner === "sw")
		return { left: 0, bottom: 0, transform: "translate(-40%, 40%)" };
	return { right: 0, bottom: 0, transform: "translate(40%, 40%)" };
}

function pagePixels(
	page: PageGeometry,
	zoom: Zoom,
	frame: { width: number; height: number },
): { width: number; height: number } {
	const { viewW, viewH } = viewSize(page);
	if (!(viewW > 0) || !(viewH > 0)) return { width: 1, height: 1 };
	if (zoom.mode === "fit-width") {
		const width = Math.max(1, Math.floor(frame.width));
		return { width, height: Math.max(1, Math.floor(width * (viewH / viewW))) };
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

function pageKey(index: number): string {
	return `page-${index}`;
}

function cappedDevicePixelRatio(): number {
	if (typeof window === "undefined") return 1;
	return Math.min(window.devicePixelRatio || 1, 2);
}

function sameNumbers(
	current: ReadonlySet<number>,
	next: ReadonlySet<number>,
): boolean {
	if (current.size !== next.size) return false;
	for (const value of current) {
		if (!next.has(value)) return false;
	}
	return true;
}
