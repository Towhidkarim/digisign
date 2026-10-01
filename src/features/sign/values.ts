const monthName = new Intl.DateTimeFormat("en", { month: "short" });

export function formatSignedAt(signedAt: number): string {
	const date = new Date(signedAt);
	return `${ordinal(date.getDate())} ${monthName.format(date)}, ${date.getFullYear()}`;
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
