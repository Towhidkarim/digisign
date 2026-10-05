/** A failure that another attempt will not fix. The consumer records it and acks. */
export class PermanentEventError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PermanentEventError";
	}
}

/** 5 * 2^attempts seconds, capped at an hour, plus up to 5 seconds of jitter. */
export function backoffSeconds(attempts: number): number {
	const base = Math.min(3600, 5 * 2 ** Math.max(1, attempts));
	return base + Math.floor(Math.random() * 6);
}
