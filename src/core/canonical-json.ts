export function canonicalJson(value: unknown): string {
	return stringify(value);
}

function stringify(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error("Canonical JSON rejects non-finite numbers.");
		}
		if (Number.isInteger(value)) return String(value);
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stringify(item)).join(",")}]`;
	}
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record).sort();
		const parts: string[] = [];
		for (const key of keys) {
			if (record[key] === undefined) continue;
			parts.push(`${JSON.stringify(key)}:${stringify(record[key])}`);
		}
		return `{${parts.join(",")}}`;
	}
	throw new Error("Canonical JSON rejects this value.");
}
