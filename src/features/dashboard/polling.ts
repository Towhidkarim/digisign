/** How long the page keeps checking quickly after work was queued. */
export const FAST_WINDOW_MS = 60_000;
export const SLOW_MS = 15_000;

const DONE_STATUSES = new Set(['completed', 'declined', 'expired', 'voided']);

/**
 * When to ask the server again, or null to stop.
 * - Queued work (busy): quickly at first, easing off, for about a minute.
 * - Otherwise, while people are still to sign: every 15 seconds.
 * - A finished document with nothing queued: stop.
 * - After failed refreshes: back off, so a bad connection is not hammered.
 */
export function nextPollDelay(input: {
  status: string;
  busy: boolean;
  busyForMs: number;
  failures: number;
}): number | null {
  if (input.failures > 0) {
    return Math.min(30_000, 3_000 * 2 ** (input.failures - 1));
  }
  if (input.busy && input.busyForMs < FAST_WINDOW_MS) {
    if (input.busyForMs < 10_000) return 1_500;
    return input.busyForMs < 30_000 ? 3_000 : 5_000;
  }
  if (input.busy) return SLOW_MS;
  if (input.status === 'in_progress') return SLOW_MS;
  return DONE_STATUSES.has(input.status) || input.status === 'draft'
    ? null
    : SLOW_MS;
}
