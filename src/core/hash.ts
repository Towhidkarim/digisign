export async function sha256Hex(data: string | Uint8Array): Promise<string> {
	const bytes =
		typeof data === "string" ? new TextEncoder().encode(data) : data.slice();
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
