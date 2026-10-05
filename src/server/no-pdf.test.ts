import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("server paths", () => {
	it("does not import a PDF library", () => {
		const root = join(process.cwd(), "src", "server");
		const files = walk(root).filter(
			(file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
		);
		const offenders = files.filter((file) => {
			const source = readFileSync(file, "utf8");
			return source.includes("pdf-lib") || source.includes("pdfjs-dist");
		});
		expect(offenders).toEqual([]);
	});
});

function walk(directory: string): string[] {
	const entries = readdirSync(directory, { withFileTypes: true });
	return entries.flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}
