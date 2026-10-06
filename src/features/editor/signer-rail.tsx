import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	CalendarDays,
	CaseSensitive,
	ChevronDown,
	ChevronUp,
	CircleCheck,
	GripVertical,
	PenLine,
	Plus,
	SquareCheck,
	TriangleAlert,
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
import { Button } from "#/components/ui/button.tsx";
import type { FieldInput } from "#/core/contracts/index.ts";
import { type FieldKind, limits } from "#/core/limits.ts";
import { checkSigners, type SignerCheck } from "#/core/signer-rules.ts";
import { ulid } from "#/core/ulid.ts";
import {
	type EditorAction,
	type EditorSigner,
	FIELD_LABEL,
	nextSignerColor,
} from "#/features/editor/reducer.ts";
import { summarizeSigner, summaryLine } from "#/features/editor/summary.ts";
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

const OVERLINE =
	"text-[11px] leading-4 font-semibold tracking-wider text-muted-foreground uppercase";

export function SignerRail({
	signers,
	selectedSignerId,
	fields,
	dispatch,
	onAddField,
	revealErrors,
}: {
	signers: readonly EditorSigner[];
	selectedSignerId: string | null;
	fields: readonly FieldInput[];
	dispatch: Dispatch<EditorAction>;
	/** Click or keyboard add: the same placement a drop makes, on the page in view. */
	onAddField: (kind: FieldKind) => void;
	/** Show "missing" errors for untouched fields too, once the user has tried to send. */
	revealErrors: boolean;
}) {
	const checks = checkSigners(signers, fields);
	const selected = signers.find((signer) => signer.id === selectedSignerId);
	return (
		<aside
			aria-label="Signers and fields"
			className="flex h-full w-80 shrink-0 flex-col gap-6 overflow-auto border-r border-border bg-card px-4 py-5"
		>
			<section aria-labelledby="rail-signers" className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-2">
					<h2 id="rail-signers" className={OVERLINE}>
						Signers · {signers.length}
					</h2>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="text-primary"
						disabled={signers.length >= limits.signersPerDocument}
						onClick={() =>
							dispatch({
								type: "add-signer",
								signer: {
									id: ulid(),
									name: `Signer ${signers.length + 1}`,
									email: "",
									color: nextSignerColor(signers.map((signer) => signer.color)),
								},
							})
						}
					>
						<Plus strokeWidth={1.75} />
						Add a signer
					</Button>
				</div>
				<ol className="flex flex-col gap-3">
					{signers.map((signer, index) => (
						<SignerRow
							key={signer.id}
							signer={signer}
							index={index}
							count={signers.length}
							selected={signer.id === selectedSignerId}
							fields={fields}
							check={checks[index]}
							revealErrors={revealErrors}
							dispatch={dispatch}
						/>
					))}
				</ol>
			</section>
			<section aria-labelledby="rail-fields" className="flex flex-col gap-4">
				<div>
					<h2 id="rail-fields" className={OVERLINE}>
						Fields
					</h2>
					{selected ? (
						<p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-full"
								style={{ background: selected.color }}
							/>
							<span className="min-w-0 truncate">
								Adding for{" "}
								<span className="font-semibold text-foreground">
									{selected.name.trim() || "this signer"}
								</span>
							</span>
						</p>
					) : null}
				</div>
				{FIELD_GROUPS.map((group) => (
					<div key={group.title} className="flex flex-col gap-2">
						<h3 className="text-small text-muted-foreground">{group.title}</h3>
						<div className="grid grid-cols-2 gap-2">
							{group.kinds.map((kind) => (
								<FieldOption
									key={kind}
									kind={kind}
									color={selected?.color}
									onAdd={onAddField}
								/>
							))}
						</div>
					</div>
				))}
				<p className="text-small leading-relaxed text-muted-foreground">
					Drag a field onto the page, or click it to add it to the page you are
					viewing.
				</p>
			</section>
		</aside>
	);
}

function SignerRow({
	signer,
	index,
	count,
	selected,
	fields,
	check,
	revealErrors,
	dispatch,
}: {
	signer: EditorSigner;
	index: number;
	count: number;
	selected: boolean;
	fields: readonly FieldInput[];
	check: SignerCheck | undefined;
	revealErrors: boolean;
	dispatch: Dispatch<EditorAction>;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [emailTouched, setEmailTouched] = useState(false);
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
	const summary = summarizeSigner(signer.id, fields);
	// "Missing" waits until the field was visited or a send was tried. Bad and repeated emails show at once.
	const emailError = emailMessage(
		check?.email ?? null,
		emailTouched || revealErrors,
	);
	const nameError =
		check?.name && (revealErrors || signer.name.length > 0 || emailTouched);
	const select = () => dispatch({ type: "select-signer", id: signer.id });
	// Hidden until the card is selected or focused, but always in the tab order.
	const control = cn(
		"size-8 text-muted-foreground transition-opacity",
		selected
			? "opacity-100"
			: "opacity-0 focus-visible:opacity-100 group-focus-within/card:opacity-100",
	);

	return (
		<li
			ref={setNodeRef}
			className={cn(
				"group/card relative overflow-hidden rounded-lg border bg-card py-3 pr-3 pl-4",
				selected ? "border-ring ring-1 ring-ring" : "border-border",
				isDragging && "opacity-40",
			)}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			onPointerDown={(event) => {
				const target = event.target;
				if (
					target instanceof Element &&
					target.closest("[data-signer-remove]")
				) {
					return;
				}
				select();
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
			<span
				aria-hidden="true"
				className="absolute inset-y-0 left-0 w-1"
				style={{ background: signer.color }}
			/>
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-label={`Drag to reorder ${name}`}
					className="cursor-grab rounded-sm p-0.5 text-ink-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring"
					style={{ touchAction: "none" }}
					{...attributes}
					{...listeners}
					onPointerDown={(event) => {
						if (typeof onGripPointerDown === "function") {
							onGripPointerDown(event);
						}
						select();
					}}
				>
					<GripVertical className="size-4" />
				</button>
				<button
					type="button"
					aria-label={`Select ${name}`}
					aria-pressed={selected}
					className="grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
					style={{ borderColor: signer.color }}
					onClick={select}
				>
					{index + 1}
				</button>
				<input
					aria-label={`Name for signer ${index + 1}`}
					value={signer.name}
					maxLength={80}
					aria-invalid={check?.name ? true : undefined}
					className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1 text-subheading font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onFocus={select}
					onChange={(event) =>
						dispatch({
							type: "rename-signer",
							id: signer.id,
							name: event.target.value,
						})
					}
					onClick={select}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className={control}
					aria-label="Move signer earlier"
					disabled={index === 0}
					onClick={() =>
						dispatch({ type: "reorder-signers", from: index, to: index - 1 })
					}
				>
					<ChevronUp />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className={control}
					aria-label="Move signer later"
					disabled={index === count - 1}
					onClick={() =>
						dispatch({ type: "reorder-signers", from: index, to: index + 1 })
					}
				>
					<ChevronDown />
				</Button>
				{count > 1 ? (
					<AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							data-signer-remove=""
							aria-label={`Remove ${name}`}
							className={control}
							onClick={() => setConfirmRemove(true)}
						>
							<X />
						</Button>
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
			</div>
			<input
				aria-label={`Email for signer ${index + 1}`}
				type="email"
				value={signer.email}
				maxLength={200}
				placeholder="Email"
				aria-invalid={emailError ? true : undefined}
				aria-describedby={emailError ? `email-error-${signer.id}` : undefined}
				className="mt-2 h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none placeholder:text-ink-subtle focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20"
				onFocus={select}
				onBlur={() => setEmailTouched(true)}
				onChange={(event) =>
					dispatch({
						type: "set-signer-email",
						id: signer.id,
						email: event.target.value,
					})
				}
				onClick={select}
			/>
			{emailError ? (
				<p
					id={`email-error-${signer.id}`}
					className="mt-1.5 text-small text-danger-fg"
				>
					{emailError}
				</p>
			) : null}
			{nameError ? (
				<p className="mt-1.5 text-small text-danger-fg">
					Enter a name for this signer.
				</p>
			) : null}
			<p
				className={cn(
					"mt-2 flex items-center gap-2 text-small",
					summary.needsSignature ? "text-warning-fg" : "text-muted-foreground",
				)}
			>
				{summary.needsSignature ? (
					<TriangleAlert
						aria-hidden="true"
						className="size-4 shrink-0 text-warning"
						strokeWidth={1.75}
					/>
				) : (
					<CircleCheck
						aria-hidden="true"
						className="size-4 shrink-0 text-success"
						strokeWidth={1.75}
					/>
				)}
				{summaryLine(summary)}
			</p>
		</li>
	);
}

export function emailMessage(
	issue: SignerCheck["email"],
	showMissing: boolean,
): string | null {
	if (issue === "missing") {
		return showMissing ? "Enter an email address so we can invite them." : null;
	}
	if (issue === "invalid")
		return "Enter a valid email address, like name@example.com.";
	if (issue === "duplicate")
		return "Another signer already uses this email address.";
	return null;
}

function FieldOption({
	kind,
	color,
	onAdd,
}: {
	kind: FieldKind;
	color: string | undefined;
	onAdd: (kind: FieldKind) => void;
}) {
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
				"flex h-20 cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
				isDragging && "opacity-40",
			)}
			style={{ touchAction: "none" }}
			{...listeners}
			{...attributes}
			onClick={() => onAdd(kind)}
		>
			<Icon
				aria-hidden="true"
				className="size-5 shrink-0"
				strokeWidth={1.75}
				style={{ color }}
			/>
			{FIELD_LABEL[kind]}
		</button>
	);
}
