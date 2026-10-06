import type {
	FieldInput,
	FieldValue,
	SignatureInput,
} from "#/core/contracts/index.ts";
import { unpackStrokes } from "#/features/sign/capture.ts";
import { FittedScript } from "#/features/sign/fitted-script.tsx";
import { SCRIPT_FACE } from "#/pdf/fonts.ts";
import { checkFractions, inkFractions, inkStrokeWidth } from "#/pdf/ink.ts";

/** A filled field's value, drawn inside the field box: ink, script, text or a check mark. */
export function InkGraphic({
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
			<svg
				viewBox={`0 0 ${fieldW} ${fieldH}`}
				className="h-full w-full"
				aria-hidden
			>
				<title>Signature</title>
				{groups.map((group) => (
					<polyline
						key={group.map((point) => `${point.x},${point.y}`).join(" ")}
						points={group
							.map((point) => `${point.x * fieldW},${point.y * fieldH}`)
							.join(" ")}
						fill="none"
						stroke="currentColor"
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
					stroke="currentColor"
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

/** A captured signature on its own, for the summaries and the saved-signature tab. */
export function SignatureImage({
	signature,
	className,
}: {
	signature: SignatureInput;
	className?: string;
}) {
	if (signature.kind === "typed") {
		return (
			<span className={`relative block ${className ?? ""}`}>
				<FittedScript
					text={signature.text}
					family={SCRIPT_FACE[signature.font].family}
					className="absolute inset-0 text-foreground"
				/>
			</span>
		);
	}
	const strokes = unpackStrokes(signature.strokes);
	return (
		<svg
			viewBox={`0 0 ${signature.box.w} ${signature.box.h}`}
			className={className}
			role="img"
			aria-label="Your drawn signature"
		>
			{strokes.map((stroke) => (
				<polyline
					key={stroke.map((point) => point.join(",")).join(" ")}
					points={stroke.map((point) => point.join(",")).join(" ")}
					fill="none"
					stroke="currentColor"
					strokeWidth={60}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			))}
		</svg>
	);
}
