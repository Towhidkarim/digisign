import { expect, it } from 'vitest';

import { formatSignedAt, signedDatePreview } from '#/features/sign/values.ts';

const HOUR = 60 * 60 * 1000;
const SESSION = 2 * HOUR;

it("formats the date in UTC, whatever the machine's zone", () => {
  expect(formatSignedAt(Date.UTC(2026, 9, 7, 23, 59))).toBe('7th Oct, 2026');
  expect(formatSignedAt(Date.UTC(2026, 9, 8, 0, 1))).toBe('8th Oct, 2026');
  expect(formatSignedAt(Date.UTC(2026, 0, 1, 12))).toBe('1st Jan, 2026');
  expect(formatSignedAt(Date.UTC(2026, 0, 12, 12))).toBe('12th Jan, 2026');
});

it('previews the same text the server writes at that moment', () => {
  const now = Date.UTC(2026, 9, 7, 9, 30);
  expect(signedDatePreview(now, SESSION).text).toBe(formatSignedAt(now));
});

it('trusts the preview mid-day', () => {
  expect(signedDatePreview(Date.UTC(2026, 9, 7, 9, 30), SESSION).reliable).toBe(
    true,
  );
});

it('does not trust the preview when the day could end during the session', () => {
  expect(
    signedDatePreview(Date.UTC(2026, 9, 7, 22, 30), SESSION).reliable,
  ).toBe(false);
  expect(
    signedDatePreview(Date.UTC(2026, 9, 7, 23, 59, 59), SESSION).reliable,
  ).toBe(false);
});
