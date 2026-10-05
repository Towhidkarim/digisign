import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const verifySchema = z.strictObject({
	documentId: z
		.string()
		.trim()
		.regex(/^[0-9A-Za-z]{10,40}$/),
});

/** Public. Returns the signed record, check results, hashed audit trail, and a ten-minute read grant. */
export const verifyManifestFn = createServerFn({ method: "POST" })
	.validator(verifySchema)
	.handler(async ({ data }) => {
		const { verifyRecord } = await import("#/server/domain/verify.ts");
		return verifyRecord(data.documentId, Date.now());
	});
