import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	CalendarDays,
	CaseSensitive,
	ChevronDown,
	ChevronUp,
	GripVertical,
	PenLine,
	SquareCheck,
	Type,
	UserRound,
	X,
} from "lucide-react";
import { type Dispatch, useState } from "react";

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
import { type FieldKind, limits } from "#/core/limits.ts";
import { ulid } from "#/core/ulid.ts";
import {
	type EditorAction,
	type EditorSigner,
	FIELD_LABEL,
	nextSignerColor,
} from "#/features/editor/reducer.ts";
import { cn } from "#/lib/utils.ts";

const FIELD_GROUPS: readonly {
	title: string;
	kinds: readonly FieldKind[];
}[] = [
	{ title: "Signature", kinds: ["signature", "initials"] },
	{ title: "Name and date", kinds: ["date_signed", "full_name"] },
	{ title: "Text", kinds: ["text", "checkbox"] },
];

const FIELD_ICON = {
	signature: PenLine,
	initials: CaseSensitive,
	date_signed: CalendarDays,
	full_name: UserRound,
	text: Type,
	checkbox: SquareCheck,
} as const;

export function SignerRail({
	signers,
	selectedSignerId,
	dispatch,
}: {
	signers: readonly EditorSigner[];
	selectedSignerId: string | null;
	dispatch: Dispatch<EditorAction>;
}) {
	return (
		<aside className="flex h-full w-64 shrink-0 flex-col gap-5 overflow-auto border-r border-black/10 bg-white px-3 py-4 md:w-72">
			<section className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-medium text-foreground">Signers</h2>
					<button
						type="button"
						className="text-sm text-[var(--harbor)] underline-offset-2 hover:underline disabled:opacity-40"
						disabled={signers.length >= limits.signersPerDocument}
						onClick={() =>
							dispatch({
								type: "add-signer",
								signer: {
									id: ulid(),
									name: `Signer ${signers.length + 1}`,
									color: nextSignerColor(signers.map((signer) => signer.color)),
								},
							})
						}
					>
						Add a signer
					</button>
				</div>
				<ol className="flex flex-col gap-2">
					{signers.map((signer, index) => (
						<SignerRow
							key={signer.id}
							signer={signer}
							index={index}
							count={signers.length}
							selected={signer.id === selectedSignerId}
							dispatch={dispatch}
						/>
					))}
				</ol>
			</section>
			{FIELD_GROUPS.map((group) => (
				<section key={group.title} className="flex flex-col gap-2">
					<h2 className="text-sm font-medium text-foreground">{group.title}</h2>
					<div className="flex flex-col gap-2">
						{group.kinds.map((kind) => (
							<FieldOption key={kind} kind={kind} />
						))}
					</div>
				</section>
			))}
			<p className="text-sm text-muted-foreground">
				Drag a field onto the page. It belongs to the selected signer.
			</p>
		</aside>
	);
}

function SignerRow({
	signer,
	index,
	count,
	selected,
	dispatch,
}: {
	signer: EditorSigner;
	index: number;
	count: number;
	selected: boolean;
	dispatch: Dispatch<EditorAction>;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: signer.id, data: { type: "signer" } });
	const name = signer.name.trim() || "this signer";
	const onGripPointerDown = listeners?.onPointerDown;

	return (
		<li
			ref={setNodeRef}
			className={cn(
				"flex items-center gap-1 rounded-lg border bg-white px-1 py-1",
				selected ? "border-transparent" : "border-black/10",
				isDragging && "opacity-40",
			)}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				...(selected ? { borderColor: signer.color, borderWidth: 2 } : null),
			}}
			onPointerDown={(event) => {
				const target = event.target;
				if (
					target instanceof Element &&
					target.closest("[data-signer-remove]")
				) {
					return;
				}
				dispatch({ type: "select-signer", id: signer.id });
			}}
			onKeyDown={(event) => {
				if (!event.altKey) return;
				if (event.key === "ArrowUp" && index > 0) {
					event.preventDefault();
					dispatch({ type: "reorder-signers", from: index, to: index - 1 });
				}
				if (event.key === "ArrowDown" && index < count - 1) {
					event.preventDefault();
					dispatch({ type: "reorder-signers", from: index, to: index + 1 });
				}
			}}
		>
			<button
				type="button"
				aria-label={`Drag to reorder ${name}`}
				className="cursor-grab rounded-sm p-1 text-muted-foreground"
				style={{ touchAction: "none" }}
				{...attributes}
				{...listeners}
				onPointerDown={(event) => {
					if (typeof onGripPointerDown === "function") {
						onGripPointerDown(event);
					}
					dispatch({ type: "select-signer", id: signer.id });
				}}
			>
				<GripVertical className="size-4" />
			</button>
			<button
				type="button"
				aria-label={`Select ${name}`}
				aria-pressed={selected}
				className="size-3.5 shrink-0 rounded-full"
				style={{ background: signer.color }}
				onClick={() => dispatch({ type: "select-signer", id: signer.id })}
			/>
			<input
				aria-label={`Name for signer ${index + 1}`}
				value={signer.name}
				maxLength={80}
				className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onChange={(event) =>
					dispatch({
						type: "rename-signer",
						id: signer.id,
						name: event.target.value,
					})
				}
				onClick={() => dispatch({ type: "select-signer", id: signer.id })}
			/>
			<button
				type="button"
				aria-label="Move signer earlier"
				className="rounded-sm p-1 text-muted-foreground disabled:opacity-30"
				disabled={index === 0}
				onClick={() =>
					dispatch({ type: "reorder-signers", from: index, to: index - 1 })
				}
			>
				<ChevronUp className="size-4" />
			</button>
			<button
				type="button"
				aria-label="Move signer later"
				className="rounded-sm p-1 text-muted-foreground disabled:opacity-30"
				disabled={index === count - 1}
				onClick={() =>
					dispatch({ type: "reorder-signers", from: index, to: index + 1 })
				}
			>
				<ChevronDown className="size-4" />
			</button>
			{count > 1 ? (
				<AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
					<button
						type="button"
						data-signer-remove=""
						aria-label={`Remove ${name}`}
						className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
						onClick={() => setConfirmRemove(true)}
					>
						<X className="size-4" />
					</button>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remove {name}?</AlertDialogTitle>
							<AlertDialogDescription>
								Their fields will come off this document.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Keep signer</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() =>
									dispatch({ type: "remove-signer", id: signer.id })
								}
							>
								Remove signer
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			) : null}
		</li>
	);
}

function FieldOption({ kind }: { kind: FieldKind }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `field-${kind}`,
		data: { type: "field", kind },
	});
	const Icon = FIELD_ICON[kind];

	return (
		<button
			ref={setNodeRef}
			type="button"
			className={cn(
				"flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-left text-sm text-foreground hover:bg-black/[0.03]",
				isDragging && "opacity-40",
			)}
			style={{ touchAction: "none" }}
			{...listeners}
			{...attributes}
		>
			<Icon className="size-4 shrink-0 text-muted-foreground" />
			{FIELD_LABEL[kind]}
		</button>
	);
}
