import { formatRelative, formatUpdated } from '#/features/dashboard/format.ts';
import type { OwnedActivity, OwnedSigner } from '#/server/domain/documents.ts';

function clock(ms: number): string {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** "11 Sep 2026 at 14:02" */
export function formatDayTime(ms: number): string {
  return `${formatUpdated(ms)} at ${clock(ms)}`;
}

const DAY = 86_400_000;

/** Relative inside the last 7 days, then "11 Sep, 14:02". */
export function formatActivityTime(ms: number, now = Date.now()): string {
  if (now - ms < 7 * DAY) return formatRelative(ms, now);
  return `${formatUpdated(ms).replace(/ \d{4}$/, '')}, ${clock(ms)}`;
}

/** A short, readable browser and system from a user agent string. */
export function browserName(userAgent: string): string {
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '';
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || 'Unknown browser';
}

export type ActivityLine = {
  seq: number;
  text: string;
  at: number;
  tone: 'brand' | 'success' | 'neutral' | 'danger';
};

/**
 * Turns the audit events into plain sentences. Invite events do not name the signer,
 * so it is inferred from the strict signing order: each new invite goes to the next signer,
 * and a reissue repeats the one who currently holds the link.
 */
export function activityLines(
  events: readonly OwnedActivity[],
  people: readonly OwnedSigner[],
): ActivityLine[] {
  let invited = -1;
  const lines = events.map((event): ActivityLine => {
    const who = event.actorName ?? 'A signer';
    const base = { seq: event.seq, at: event.occurredAt };
    switch (event.type) {
      case 'document.created':
        return { ...base, text: 'Document created', tone: 'neutral' };
      case 'document.source_uploaded':
        return { ...base, text: 'PDF stored', tone: 'neutral' };
      case 'document.published':
        return { ...base, text: 'Document sent for signature', tone: 'brand' };
      case 'document.completed':
        return { ...base, text: 'Document completed', tone: 'success' };
      case 'document.voided':
        return { ...base, text: 'You voided the document', tone: 'neutral' };
      case 'document.expired':
        return { ...base, text: 'Document expired', tone: 'neutral' };
      case 'document.declined':
        return { ...base, text: 'Document declined', tone: 'danger' };
      case 'signer.invited': {
        if (!event.reissue) invited += 1;
        const name = people[Math.max(invited, 0)]?.name ?? 'The next signer';
        return {
          ...base,
          text: event.reissue
            ? `New signing link made for ${name}`
            : `${name} was invited to sign`,
          tone: 'brand',
        };
      }
      case 'signer.viewed':
        return { ...base, text: `${who} opened the document`, tone: 'brand' };
      case 'signer.signed':
        return { ...base, text: `${who} signed`, tone: 'success' };
      case 'signer.declined':
        return { ...base, text: `${who} declined`, tone: 'danger' };
      default:
        return { ...base, text: 'Recorded', tone: 'neutral' };
    }
  });
  return lines.reverse();
}
