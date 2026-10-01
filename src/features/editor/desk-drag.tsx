import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	type Modifier,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	type Dispatch,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

import { pointerToMicro } from "#/core/coords.ts";
import type { FieldKind } from "#/core/limits.ts";
import { ulid } from "#/core/ulid.ts";
import {
	type EditorAction,
	type EditorSigner,
	FIELD_LABEL,
} from "#/features/editor/reducer.ts";

export function setFieldGrabCursor(active: boolean): void {
	if (typeof document === "undefined") return;
	if (active) document.documentElement.dataset.fieldDrag = "true";
	else delete document.documentElement.dataset.fieldDrag;
}

type ActiveDrag =
	| { type: "field"; kind: FieldKind }
	| { type: "signer"; id: string };

const centerOnCursor: Modifier = ({
	activatorEvent,
	draggingNodeRect,
	overlayNodeRect,
	transform,
}) => {
	if (
		!draggingNodeRect ||
		!overlayNodeRect ||
		!activatorEvent ||
		!("clientX" in activatorEvent) ||
		!("clientY" in activatorEvent)
	) {
		return transform;
	}
	const event = activatorEvent as PointerEvent;
	return {
		...transform,
		x:
			transform.x +
			event.clientX -
			draggingNodeRect.left -
			overlayNodeRect.width / 2,
		y:
			transform.y +
			event.clientY -
			draggingNodeRect.top -
			overlayNodeRect.height / 2,
	};
};

export function DeskDrag({
	signers,
	fieldColor,
	dispatch,
	children,
}: {
	signers: readonly EditorSigner[];
	fieldColor: string;
	dispatch: Dispatch<EditorAction>;
	children: ReactNode;
}) {
	const [active, setActive] = useState<ActiveDrag | null>(null);
	const reorderRecords = useRef(true);
	const pointer = useRef<{ x: number; y: number } | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	function clear() {
		setActive(null);
		setFieldGrabCursor(false);
	}

	useEffect(() => {
		function onMove(event: PointerEvent) {
			pointer.current = { x: event.clientX, y: event.clientY };
		}
		window.addEventListener("pointermove", onMove);
		return () => window.removeEventListener("pointermove", onMove);
	}, []);

	function onDragStart(event: DragStartEvent) {
		const drag = readDrag(event.active.data.current, String(event.active.id));
		if (!drag) return;
		setActive(drag);
		setFieldGrabCursor(true);
		reorderRecords.current = true;
	}

	function onDragOver(event: DragOverEvent) {
		if (event.active.data.current?.type !== "signer" || !event.over) return;
		const from = signers.findIndex((signer) => signer.id === event.active.id);
		const to = signers.findIndex((signer) => signer.id === event.over?.id);
		if (from < 0 || to < 0 || from === to) return;
		dispatch({
			type: "reorder-signers",
			from,
			to,
			record: reorderRecords.current,
		});
		reorderRecords.current = false;
	}

	function onDragEnd(event: DragEndEvent) {
		const drag = readDrag(event.active.data.current, String(event.active.id));
		clear();
		if (drag?.type !== "field" || !event.over) return;
		const pageIndex = event.over.data.current?.pageIndex;
		if (typeof pageIndex !== "number") return;
		const point = pointer.current;
		const page = document.querySelector(`[data-page-index="${pageIndex}"]`);
		if (!point || !(page instanceof HTMLElement)) return;
		const rect = page.getBoundingClientRect();
		dispatch({
			type: "place",
			id: ulid(),
			pageIndex,
			kind: drag.kind,
			x: pointerToMicro(point.x, rect.left, rect.width),
			y: pointerToMicro(point.y, rect.top, rect.height),
		});
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionFor}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragEnd={onDragEnd}
			onDragCancel={clear}
		>
			<SortableContext
				items={signers.map((signer) => signer.id)}
				strategy={verticalListSortingStrategy}
			>
				{children}
			</SortableContext>
			<DragOverlay
				dropAnimation={null}
				zIndex={40}
				modifiers={active?.type === "field" ? [centerOnCursor] : undefined}
				style={
					active?.type === "field"
						? { width: 176, height: 52, pointerEvents: "none" }
						: { pointerEvents: "none" }
				}
			>
				{active?.type === "field" ? (
					<div
						className="flex h-full w-full items-center justify-center rounded-md border-2 bg-white/80 text-sm text-foreground shadow-[0_10px_24px_rgba(18,52,74,0.16)]"
						style={{ borderColor: fieldColor }}
					>
						{FIELD_LABEL[active.kind]}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

function collisionFor(
	args: Parameters<typeof pointerWithin>[0],
): ReturnType<typeof pointerWithin> {
	const kind = args.active.data.current?.type;
	if (kind === "signer") {
		return closestCenter(args).filter((hit) => {
			const data = args.droppableContainers.find(
				(container) => container.id === hit.id,
			)?.data.current;
			return data?.type === "signer";
		});
	}
	return pointerWithin(args).filter((hit) => {
		const data = args.droppableContainers.find(
			(container) => container.id === hit.id,
		)?.data.current;
		return typeof data?.pageIndex === "number";
	});
}

function readDrag(
	data: Record<string, unknown> | undefined,
	id: string,
): ActiveDrag | null {
	if (data?.type === "field" && typeof data.kind === "string") {
		return { type: "field", kind: data.kind as FieldKind };
	}
	if (data?.type === "signer") return { type: "signer", id };
	return null;
}
