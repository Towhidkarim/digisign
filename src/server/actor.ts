/** Fixed creator until Phase 4. Crockford ULID, so the alphabet skips I, L, O, and U. */
export const DEV_OWNER_ID = "01HZDEV0000000000000000001";

export function resolveActor(): { id: string; role: "owner" } {
	return { id: DEV_OWNER_ID, role: "owner" };
}
