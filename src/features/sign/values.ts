const monthName = new Intl.DateTimeFormat("en", {
	month: "short",
	timeZone: "UTC",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The text a "Date signed" field gets. It is always read in UTC, so the server (which writes
 * it) and the browser (which previews it) cannot disagree because of a time zone.
 */
export function formatSignedAt(signedAt: number): string {
	const date = new Date(signedAt);
	return `${ordinal(date.getUTCDate())} ${monthName.format(date)}, ${date.getUTCFullYear()}`;
}

/**
 * The date to preview in a "Date signed" field. `reliable` is false when the UTC day could
 * roll over before the signing session ends, so the preview might differ from what the
 * server writes. The page should then say "Filled in when you sign" instead of a date.
 */
export function signedDatePreview(
	serverNow: number,
	sessionMs: number,
): { text: string; reliable: boolean } {
	const untilMidnight = DAY_MS - (serverNow % DAY_MS);
	return {
		text: formatSignedAt(serverNow),
		reliable: untilMidnight > sessionMs,
	};
}

export function formatSignedTime(signedAt: number): string {
	return new Date(signedAt).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function ordinal(day: number): string {
	const teen = day % 100;
	if (teen >= 11 && teen <= 13) return `${day}th`;
	if (day % 10 === 1) return `${day}st`;
	if (day % 10 === 2) return `${day}nd`;
	if (day % 10 === 3) return `${day}rd`;
	return `${day}th`;
}
