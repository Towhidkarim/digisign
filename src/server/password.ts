/**
 * Password hashing for creator accounts.
 *
 * Better Auth's default is scrypt in JavaScript. It took about 85 ms per hash in a local measurement,
 * far over the 10 ms Workers Free budget. This uses the runtime's native PBKDF2-SHA256 instead.
 * 100,000 iterations is the most Workers allows. Revisit the count (and the plan) after measuring
 * CPU time in Workers observability.
 */
export const PBKDF2_ITERATIONS = 100_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

async function derive(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password.normalize("NFKC")),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const saltCopy = new ArrayBuffer(salt.byteLength);
	new Uint8Array(saltCopy).set(salt);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: saltCopy, iterations },
		key,
		KEY_BITS,
	);
	return new Uint8Array(bits);
}

/** Format: `pbkdf2-sha256$iterations$salt$hash` (base64). */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(input: {
	hash: string;
	password: string;
}): Promise<boolean> {
	const [scheme, rounds, salt, expected] = input.hash.split("$");
	const iterations = Number(rounds);
	if (scheme !== "pbkdf2-sha256" || !salt || !expected) return false;
	if (
		!Number.isInteger(iterations) ||
		iterations < 1 ||
		iterations > PBKDF2_ITERATIONS
	)
		return false;
	const actual = await derive(input.password, fromBase64(salt), iterations);
	const wanted = fromBase64(expected);
	if (wanted.length !== actual.length) return false;
	let diff = 0;
	for (let index = 0; index < actual.length; index += 1) {
		diff |= (actual[index] ?? 0) ^ (wanted[index] ?? 0);
	}
	return diff === 0;
}
