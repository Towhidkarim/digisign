// Fails when browser-only libraries leak into the Worker bundle or the bundle grows past budget.
//
//   pnpm build && pnpm check:bundle
//
// Browser-only screens must load through `lazyDesk(import.meta.env.SSR ? null : () => import(...))`
// (see src/lib/lazy-desk.tsx). Workers Free allows 3 MB gzipped. The budget leaves headroom.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const FILE = "dist/server/index.js";
const GZIP_BUDGET_KB = 1000;
const FORBIDDEN = [
	["PDFDocument", "pdf-lib"],
	["GlobalWorkerOptions", "pdf.js"],
	["TTFFont", "fontkit"],
];

let source;
try {
	source = readFileSync(FILE, "utf8");
} catch {
	console.error(`Missing ${FILE}. Run pnpm build first.`);
	process.exit(1);
}

const problems = [];
for (const [marker, name] of FORBIDDEN) {
	if (source.includes(marker)) problems.push(`${name} is in the server bundle (found "${marker}").`);
}
const gzipKb = Math.round(gzipSync(source).length / 1024);
if (gzipKb > GZIP_BUDGET_KB) problems.push(`Server bundle is ${gzipKb} KB gzipped, over the ${GZIP_BUDGET_KB} KB budget.`);

console.log(`Server bundle: ${Math.round(source.length / 1024)} KB raw, ${gzipKb} KB gzipped.`);
if (problems.length > 0) {
	for (const problem of problems) console.error(`- ${problem}`);
	console.error("Load browser-only screens with lazyDesk(import.meta.env.SSR ? null : () => import(...)).");
	process.exit(1);
}
console.log("Bundle check passed.");
