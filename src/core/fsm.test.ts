import { describe, expect, it } from "vitest";

import {
	canTransition,
	documentTransitions,
	signerTransitions,
} from "#/core/fsm.ts";

describe("status transitions", () => {
	it("allows only the document transitions in the table", () => {
		expect(canTransition(documentTransitions, "draft", "in_progress")).toBe(
			true,
		);
		expect(canTransition(documentTransitions, "draft", "completed")).toBe(
			false,
		);
		expect(canTransition(documentTransitions, "in_progress", "voided")).toBe(
			true,
		);
		expect(canTransition(documentTransitions, "completed", "draft")).toBe(
			false,
		);
	});

	it("allows only the signer transitions in the table", () => {
		expect(canTransition(signerTransitions, "pending", "invited")).toBe(true);
		expect(canTransition(signerTransitions, "pending", "voided")).toBe(true);
		expect(canTransition(signerTransitions, "invited", "signed")).toBe(true);
		expect(canTransition(signerTransitions, "signed", "declined")).toBe(false);
	});
});
