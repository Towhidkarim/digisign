import { env } from "cloudflare:workers";

type KeyMaterial = {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	keyId: string;
};

const KEY_ID = "k1";

let cached: KeyMaterial | null = null;

function algorithm(): AlgorithmIdentifier {
	return { name: "Ed25519" };
}

export async function manifestKeys(): Promise<KeyMaterial> {
	if (cached) return cached;
	const secret = env.MANIFEST_SIGNING_KEY;
	if (secret) {
		const privateKey = await crypto.subtle.importKey(
			"pkcs8",
			bufferSource(base64ToBytes(secret)),
			algorithm(),
			true,
			["sign"],
		);
		const publicJwk = await crypto.subtle.exportKey("jwk", privateKey);
		delete publicJwk.d;
		publicJwk.key_ops = ["verify"];
		const publicKey = await crypto.subtle.importKey(
			"jwk",
			publicJwk,
			algorithm(),
			true,
			["verify"],
		);
		cached = { privateKey, publicKey, keyId: KEY_ID };
		return cached;
	}
	const pair = (await crypto.subtle.generateKey(algorithm(), true, [
		"sign",
		"verify",
	])) as CryptoKeyPair;
	cached = {
		privateKey: pair.privateKey,
		publicKey: pair.publicKey,
		keyId: "dev",
	};
	return cached;
}

export async function signCanonical(canonical: string): Promise<{
	keyId: string;
	sig: string;
}> {
	const { privateKey, keyId } = await manifestKeys();
	const signature = await crypto.subtle.sign(
		algorithm(),
		privateKey,
		new TextEncoder().encode(canonical),
	);
	return { keyId, sig: bytesToBase64(new Uint8Array(signature)) };
}

export async function verifyCanonical(
	canonical: string,
	sig: string,
): Promise<boolean> {
	const { publicKey } = await manifestKeys();
	return crypto.subtle.verify(
		algorithm(),
		publicKey,
		bufferSource(base64ToBytes(sig)),
		bufferSource(new TextEncoder().encode(canonical)),
	);
}

export async function exportManifestPublicJwk(): Promise<
	JsonWebKey & { kid: string }
> {
	const { publicKey, keyId } = await manifestKeys();
	const jwk = await crypto.subtle.exportKey("jwk", publicKey);
	return { ...jwk, kid: keyId };
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
	const copy = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copy).set(bytes);
	return copy;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(packed: string): Uint8Array {
	const binary = atob(packed);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}
