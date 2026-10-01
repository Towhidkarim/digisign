import { canonicalJson } from "#/core/canonical-json.ts";
import type {
	PageGeometryInput,
	SaveLayoutInput,
} from "#/core/contracts/index.ts";
import { sha256Hex } from "#/core/hash.ts";

export async function signingStateHash(input: {
	sourceSha256: string;
	geometry: readonly PageGeometryInput[];
	layout: SaveLayoutInput;
	priorEvidenceSha256: readonly string[];
}): Promise<string> {
	const geometrySha256 = await sha256Hex(canonicalJson(input.geometry));
	const layoutSha256 = await sha256Hex(canonicalJson(input.layout));
	return sha256Hex(
		canonicalJson({
			sourceSha256: input.sourceSha256,
			geometrySha256,
			layoutSha256,
			priorEvidence: input.priorEvidenceSha256,
		}),
	);
}

export async function evidenceHash(value: unknown): Promise<string> {
	return sha256Hex(canonicalJson(value));
}
