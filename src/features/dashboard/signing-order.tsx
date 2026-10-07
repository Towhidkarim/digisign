import { SignerStatusBadge } from '#/components/status-badge.tsx';
import { signerColor } from '#/core/signer-colors.ts';
import {
  browserName,
  formatDayTime,
} from '#/features/dashboard/detail-format.ts';
import { formatRelative } from '#/features/dashboard/format.ts';
import type { OwnedSigner } from '#/server/domain/documents.ts';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** The line under a signer's email: what has happened, or when they will be invited. */
function timeline(
  signer: OwnedSigner,
  previous: OwnedSigner | undefined,
): string[] {
  if (signer.status === 'signed' && signer.signedAt != null) {
    return [`Signed ${formatDayTime(signer.signedAt)}`];
  }
  if (signer.status === 'invited') {
    return [
      signer.invitedAt != null
        ? `Invited ${formatRelative(signer.invitedAt)}`
        : 'Invited',
      ...(signer.firstViewedAt != null
        ? [`Opened ${formatRelative(signer.firstViewedAt)}`]
        : []),
    ];
  }
  if (signer.status === 'pending') {
    return [
      previous
        ? `Will be invited after ${previous.name} signs`
        : 'Will be invited first',
    ];
  }
  return [];
}

export function SigningOrder({ signers }: { signers: readonly OwnedSigner[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 md:p-6">
      <h2 className="text-heading font-semibold">Signing order</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each person is invited after the one before them signs.
      </p>
      {signers.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No one is named on this document yet.
        </p>
      ) : (
        <ol className="mt-6">
          {signers.map((signer, index) => {
            const lines = timeline(signer, signers[index - 1]);
            const evidence =
              signer.status === 'signed'
                ? [
                    signer.userAgent?.trim()
                      ? browserName(signer.userAgent)
                      : '',
                    signer.clientIp && signer.clientIp !== 'unknown'
                      ? signer.clientIp.trim()
                      : '',
                  ].filter((part) => part.length > 0)
                : [];
            const last = index === signers.length - 1;
            return (
              <li
                key={signer.id}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                {last ? null : (
                  <span
                    aria-hidden="true"
                    className="absolute top-12 bottom-1 left-5 w-px -translate-x-1/2 bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full border-2 bg-card text-xs font-semibold"
                  style={{ borderColor: signerColor(index) }}
                >
                  {initials(signer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-subheading font-semibold break-words">
                      <span className="font-normal text-muted-foreground">
                        {signer.order}.{' '}
                      </span>
                      {signer.name}
                    </p>
                    <SignerStatusBadge status={signer.status} />
                  </div>
                  {signer.email ? (
                    <p className="text-small break-all text-muted-foreground">
                      {signer.email}
                    </p>
                  ) : null}
                  {lines.map((line) => (
                    <p
                      key={line}
                      className="mt-1 text-small text-muted-foreground"
                    >
                      {line}
                    </p>
                  ))}
                  {signer.declineReason ? (
                    <p className="mt-1 max-w-[52ch] text-small break-words text-danger-fg">
                      {signer.declineReason}
                    </p>
                  ) : null}
                  {evidence.length > 0 ? (
                    <p className="mt-1 text-xs break-words text-ink-subtle">
                      {evidence.join(' · ')}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
