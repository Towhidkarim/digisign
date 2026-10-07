import { describe, expect, it } from 'vitest';

import {
  FAST_WINDOW_MS,
  nextPollDelay,
  SLOW_MS,
} from '#/features/dashboard/polling.ts';

const base = { status: 'in_progress', busy: false, busyForMs: 0, failures: 0 };

describe('nextPollDelay', () => {
  it('checks quickly at first while work is queued, then eases off', () => {
    expect(nextPollDelay({ ...base, busy: true, busyForMs: 0 })).toBe(1_500);
    expect(nextPollDelay({ ...base, busy: true, busyForMs: 15_000 })).toBe(
      3_000,
    );
    expect(nextPollDelay({ ...base, busy: true, busyForMs: 45_000 })).toBe(
      5_000,
    );
  });

  it('falls back to the slow pace when queued work takes longer than a minute', () => {
    expect(
      nextPollDelay({ ...base, busy: true, busyForMs: FAST_WINDOW_MS }),
    ).toBe(SLOW_MS);
  });

  it('checks every 15 seconds while people are still to sign', () => {
    expect(nextPollDelay(base)).toBe(15_000);
  });

  it('stops once the document is finished and nothing is queued', () => {
    for (const status of ['completed', 'declined', 'expired', 'voided']) {
      expect(nextPollDelay({ ...base, status })).toBeNull();
    }
    expect(nextPollDelay({ ...base, status: 'draft' })).toBeNull();
  });

  it('keeps checking a finished document until its notices and anchor are done', () => {
    expect(nextPollDelay({ ...base, status: 'completed', busy: true })).toBe(
      1_500,
    );
  });

  it('backs off after failed refreshes', () => {
    expect(nextPollDelay({ ...base, busy: true, failures: 1 })).toBe(3_000);
    expect(nextPollDelay({ ...base, failures: 3 })).toBe(12_000);
    expect(nextPollDelay({ ...base, failures: 9 })).toBe(30_000);
  });
});
