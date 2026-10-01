import type { FieldInput, SaveLayoutInput } from "#/core/contracts/index.ts";
import {
	footerStripMicro,
	MICRO,
	type PageGeometry,
	ptToMicro,
	viewSize,
} from "#/core/coords.ts";
import { type FieldKind, limits, minFieldSizePt } from "#/core/limits.ts";

export const SIGNER_COLORS = [
	"#F08A1E",
	"#2E8B57",
	"#3B5BDB",
	"#6B3FA0",
	"#C8960A",
	"#0E7C86",
	"#8A5A2B",
	"#4E5B3A",
	"#3D6B8A",
	"#6E4A86",
] as const;

export const FIELD_LABEL: Record<FieldKind, string> = {
	signature: "Signature",
	initials: "Initials",
	date_signed: "Date signed",
	full_name: "Full name",
	text: "Text box",
	checkbox: "Checkmark",
};

const READABLE_MIN_PT: Record<FieldKind, { w: number; h: number }> = {
	signature: limits.signatureFieldMinPt,
	initials: limits.initialsFieldMinPt,
	date_signed: { w: 90, h: 16 },
	full_name: { w: 140, h: 16 },
	text: { w: 72, h: 16 },
	checkbox: { w: 14, h: 14 },
};

const DEFAULT_SIZE_PT: Record<FieldKind, { w: number; h: number }> = {
	signature: { w: 180, h: 48 },
	initials: { w: 48, h: 32 },
	date_signed: { w: 108, h: 20 },
	full_name: { w: 160, h: 20 },
	text: { w: 180, h: 24 },
	checkbox: { w: 18, h: 18 },
};

export type EditorSigner = {
	id: string;
	name: string;
	color: string;
};

type Snapshot = {
	signers: EditorSigner[];
	fields: FieldInput[];
	selectedSignerId: string | null;
	selectedFieldId: string | null;
	layoutVersion: number;
};

export type EditorState = {
	documentId: string;
	geometry: PageGeometry[];
	signers: EditorSigner[];
	fields: FieldInput[];
	selectedSignerId: string | null;
	selectedFieldId: string | null;
	layoutVersion: number;
	past: Snapshot[];
	future: Snapshot[];
};

export type EditorAction =
	| {
			type: "place";
			id: string;
			pageIndex: number;
			kind: FieldKind;
			x: number;
			y: number;
	  }
	| { type: "move"; id: string; x: number; y: number; record: boolean }
	| {
			type: "resize";
			id: string;
			x: number;
			y: number;
			w: number;
			h: number;
			record: boolean;
	  }
	| { type: "nudge"; id: string; dx: number; dy: number }
	| { type: "delete"; id: string }
	| { type: "set-required"; id: string; required: boolean }
	| { type: "select-field"; id: string | null }
	| { type: "select-signer"; id: string }
	| { type: "add-signer"; signer: EditorSigner }
	| { type: "rename-signer"; id: string; name: string }
	| { type: "reorder-signers"; from: number; to: number; record?: boolean }
	| { type: "remove-signer"; id: string }
	| { type: "undo" }
	| { type: "redo" };

const HISTORY_LIMIT = 100;

export function minimumSizePt(kind: FieldKind): { w: number; h: number } {
	return minFieldSizePt(kind) ?? READABLE_MIN_PT[kind];
}

export function nextSignerColor(used: readonly string[]): string {
	const free = SIGNER_COLORS.find((color) => !used.includes(color));
	return (
		free ??
		SIGNER_COLORS[used.length % SIGNER_COLORS.length] ??
		SIGNER_COLORS[0]
	);
}

export function createEditorState(input: {
	documentId: string;
	geometry: readonly PageGeometry[];
	signers: readonly EditorSigner[];
	fields?: readonly FieldInput[];
	layoutVersion?: number;
}): EditorState {
	const signers = input.signers.map((signer) => ({ ...signer }));
	return {
		documentId: input.documentId,
		geometry: input.geometry.map((page) => ({
			mediaBox: [...page.mediaBox],
			cropBox: [...page.cropBox],
			rotate: page.rotate,
		})),
		signers,
		fields: (input.fields ?? []).map((field) => ({ ...field })),
		selectedSignerId: signers[0]?.id ?? null,
		selectedFieldId: null,
		layoutVersion: input.layoutVersion ?? 0,
		past: [],
		future: [],
	};
}

export function toSaveLayout(state: EditorState): SaveLayoutInput {
	return {
		documentId: state.documentId,
		layoutVersion: state.layoutVersion,
		fields: state.fields.map((field) => ({ ...field })),
	};
}

export function editorReducer(
	state: EditorState,
	action: EditorAction,
): EditorState {
	switch (action.type) {
		case "place":
			return placeField(state, action);
		case "move":
			return moveField(state, action);
		case "resize":
			return resizeField(state, action);
		case "nudge":
			return nudgeField(state, action);
		case "delete":
			return deleteField(state, action.id);
		case "set-required":
			return setRequired(state, action.id, action.required);
		case "select-field":
			return { ...state, selectedFieldId: action.id };
		case "select-signer":
			return state.signers.some((signer) => signer.id === action.id)
				? { ...state, selectedSignerId: action.id }
				: state;
		case "add-signer":
			return addSigner(state, action.signer);
		case "rename-signer":
			return {
				...state,
				signers: state.signers.map((signer) =>
					signer.id === action.id ? { ...signer, name: action.name } : signer,
				),
			};
		case "reorder-signers":
			return reorderSigners(
				state,
				action.from,
				action.to,
				action.record !== false,
			);
		case "remove-signer":
			return removeSigner(state, action.id);
		case "undo":
			return undo(state);
		case "redo":
			return redo(state);
	}
}

function placeField(
	state: EditorState,
	action: Extract<EditorAction, { type: "place" }>,
): EditorState {
	if (!state.selectedSignerId) return state;
	if (state.fields.length >= limits.fieldsPerDocument) return state;
	const page = state.geometry[action.pageIndex];
	if (!page) return state;
	const onPage = state.fields.filter(
		(field) => field.pageIndex === action.pageIndex,
	).length;
	if (onPage >= limits.fieldsPerPage) return state;
	const { viewW, viewH } = viewSize(page);
	const size = DEFAULT_SIZE_PT[action.kind];
	const w = ptToMicro(size.w, viewW);
	const h = ptToMicro(size.h, viewH);
	const rect = clampRect(page, action.kind, {
		x: action.x - Math.round(w / 2),
		y: action.y - Math.round(h / 2),
		w,
		h,
	});
	if (!rect) return state;
	const field: FieldInput = {
		id: action.id,
		signerId: state.selectedSignerId,
		pageIndex: action.pageIndex,
		kind: action.kind,
		required: true,
		...rect,
	};
	return withHistory(
		state,
		{ fields: [...state.fields, field], selectedFieldId: field.id },
		true,
	);
}

function moveField(
	state: EditorState,
	action: Extract<EditorAction, { type: "move" }>,
): EditorState {
	const field = state.fields.find((item) => item.id === action.id);
	const page = field ? state.geometry[field.pageIndex] : undefined;
	if (!field || !page) return state;
	const rect = clampRect(page, field.kind, {
		x: action.x,
		y: action.y,
		w: field.w,
		h: field.h,
	});
	if (!rect) return state;
	const fields = replaceRect(state.fields, field.id, rect);
	if (action.record) {
		return withHistory(state, { fields, selectedFieldId: field.id }, true);
	}
	return { ...state, fields, selectedFieldId: field.id };
}

function resizeField(
	state: EditorState,
	action: Extract<EditorAction, { type: "resize" }>,
): EditorState {
	const field = state.fields.find((item) => item.id === action.id);
	const page = field ? state.geometry[field.pageIndex] : undefined;
	if (!field || !page) return state;
	const rect = clampRect(page, field.kind, normalizeRect(action));
	if (!rect) return state;
	const fields = replaceRect(state.fields, field.id, rect);
	if (action.record) {
		return withHistory(state, { fields, selectedFieldId: field.id }, true);
	}
	return { ...state, fields, selectedFieldId: field.id };
}

function nudgeField(
	state: EditorState,
	action: Extract<EditorAction, { type: "nudge" }>,
): EditorState {
	const field = state.fields.find((item) => item.id === action.id);
	const page = field ? state.geometry[field.pageIndex] : undefined;
	if (!field || !page) return state;
	const rect = clampRect(page, field.kind, {
		x: field.x + action.dx,
		y: field.y + action.dy,
		w: field.w,
		h: field.h,
	});
	if (!rect || sameRect(field, rect)) return state;
	return withHistory(
		state,
		{
			fields: replaceRect(state.fields, field.id, rect),
			selectedFieldId: field.id,
		},
		true,
	);
}

function setRequired(
	state: EditorState,
	id: string,
	required: boolean,
): EditorState {
	const field = state.fields.find((item) => item.id === id);
	if (!field || field.required === required) return state;
	return withHistory(
		state,
		{
			fields: state.fields.map((item) =>
				item.id === id ? { ...item, required } : { ...item },
			),
			selectedFieldId: id,
		},
		true,
	);
}

function deleteField(state: EditorState, id: string): EditorState {
	if (!state.fields.some((field) => field.id === id)) return state;
	return withHistory(
		state,
		{
			fields: state.fields.filter((field) => field.id !== id),
			selectedFieldId:
				state.selectedFieldId === id ? null : state.selectedFieldId,
		},
		true,
	);
}

function addSigner(state: EditorState, signer: EditorSigner): EditorState {
	if (state.signers.length >= limits.signersPerDocument) return state;
	if (state.signers.some((item) => item.id === signer.id)) return state;
	return withHistory(
		state,
		{
			signers: [...state.signers, { ...signer }],
			selectedSignerId: signer.id,
		},
		false,
	);
}

function reorderSigners(
	state: EditorState,
	from: number,
	to: number,
	record: boolean,
): EditorState {
	if (from === to) return state;
	if (from < 0 || from >= state.signers.length) return state;
	const target = Math.max(0, Math.min(state.signers.length - 1, to));
	if (from === target) return state;
	const signers = state.signers.map((signer) => ({ ...signer }));
	const [moved] = signers.splice(from, 1);
	if (!moved) return state;
	signers.splice(target, 0, moved);
	if (!record) return { ...state, signers };
	return withHistory(state, { signers }, false);
}

function removeSigner(state: EditorState, id: string): EditorState {
	if (state.signers.length <= 1) return state;
	if (!state.signers.some((signer) => signer.id === id)) return state;
	const signers = state.signers.filter((signer) => signer.id !== id);
	const fields = state.fields.filter((field) => field.signerId !== id);
	const selectedField = state.fields.find(
		(field) => field.id === state.selectedFieldId,
	);
	return withHistory(
		state,
		{
			signers,
			fields,
			selectedSignerId:
				state.selectedSignerId === id
					? (signers[0]?.id ?? null)
					: state.selectedSignerId,
			selectedFieldId:
				selectedField?.signerId === id ? null : state.selectedFieldId,
		},
		fields.length !== state.fields.length,
	);
}

function undo(state: EditorState): EditorState {
	const previous = state.past.at(-1);
	if (!previous) return state;
	return {
		...state,
		...cloneSnapshot(previous),
		past: state.past.slice(0, -1),
		future: [...state.future, snapshot(state)],
	};
}

function redo(state: EditorState): EditorState {
	const next = state.future.at(-1);
	if (!next) return state;
	return {
		...state,
		...cloneSnapshot(next),
		past: [...state.past, snapshot(state)],
		future: state.future.slice(0, -1),
	};
}

function withHistory(
	state: EditorState,
	next: Partial<EditorState>,
	bumpVersion: boolean,
): EditorState {
	return {
		...state,
		...next,
		past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
		future: [],
		layoutVersion: bumpVersion ? state.layoutVersion + 1 : state.layoutVersion,
	};
}

function snapshot(state: EditorState): Snapshot {
	return {
		signers: state.signers.map((signer) => ({ ...signer })),
		fields: state.fields.map((field) => ({ ...field })),
		selectedSignerId: state.selectedSignerId,
		selectedFieldId: state.selectedFieldId,
		layoutVersion: state.layoutVersion,
	};
}

function cloneSnapshot(shot: Snapshot): Snapshot {
	return {
		signers: shot.signers.map((signer) => ({ ...signer })),
		fields: shot.fields.map((field) => ({ ...field })),
		selectedSignerId: shot.selectedSignerId,
		selectedFieldId: shot.selectedFieldId,
		layoutVersion: shot.layoutVersion,
	};
}

function replaceRect(
	fields: readonly FieldInput[],
	id: string,
	rect: { x: number; y: number; w: number; h: number },
): FieldInput[] {
	return fields.map((field) =>
		field.id === id ? { ...field, ...rect } : { ...field },
	);
}

function sameRect(
	field: FieldInput,
	rect: { x: number; y: number; w: number; h: number },
): boolean {
	return (
		field.x === rect.x &&
		field.y === rect.y &&
		field.w === rect.w &&
		field.h === rect.h
	);
}

function normalizeRect(rect: { x: number; y: number; w: number; h: number }): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	let { x, y, w, h } = rect;
	if (w < 0) {
		x += w;
		w = -w;
	}
	if (h < 0) {
		y += h;
		h = -h;
	}
	return { x, y, w, h };
}

function clampRect(
	page: PageGeometry,
	kind: FieldKind,
	rect: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } | null {
	const { viewW, viewH } = viewSize(page);
	const min = minimumSizePt(kind);
	const minW = ptToMicro(min.w, viewW);
	const minH = ptToMicro(min.h, viewH);
	const maxY = MICRO - footerStripMicro(page);
	if (minW > MICRO || minH > maxY) return null;
	if (
		![rect.x, rect.y, rect.w, rect.h].every((value) => Number.isFinite(value))
	) {
		return null;
	}
	const w = Math.min(MICRO, Math.max(minW, Math.round(rect.w)));
	const h = Math.min(maxY, Math.max(minH, Math.round(rect.h)));
	const x = Math.min(MICRO - w, Math.max(0, Math.round(rect.x)));
	const y = Math.min(maxY - h, Math.max(0, Math.round(rect.y)));
	return { x, y, w, h };
}
