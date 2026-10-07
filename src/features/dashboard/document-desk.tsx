import { Link, useRouter } from '@tanstack/react-router';
import {
  Ban,
  ChevronLeft,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Download,
  FileText,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { isDocumentStatus, StatusBadge } from '#/components/status-badge.tsx';
import { Alert, AlertDescription } from '#/components/ui/alert.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog.tsx';
import { Button } from '#/components/ui/button.tsx';
import { ActivityCard } from '#/features/dashboard/activity-card.tsx';
import { activityLines } from '#/features/dashboard/detail-format.ts';
import {
  displayTitle,
  formatRelative,
  formatUpdated,
  formatWhen,
} from '#/features/dashboard/format.ts';
import { SigningOrder } from '#/features/dashboard/signing-order.tsx';
import { cn } from '#/lib/utils.ts';
import { reissueInviteFn, voidDocumentFn } from '#/server/documents.ts';
import type {
  OwnedDocumentDetail,
  OwnedSigner,
} from '#/server/domain/documents.ts';

/** The signed PDF is built in the browser with pdf-lib, so it loads on demand and never in the Worker bundle. */
const loadSignedPdf = import.meta.env.SSR
  ? null
  : () => import('#/features/dashboard/signed-pdf.ts');

type Notice = { tone: 'info' | 'destructive'; text: string };
type Busy = 'link' | 'void' | 'signed' | null;

export function DocumentDesk({ document }: { document: OwnedDocumentDetail }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [voidOpen, setVoidOpen] = useState(false);

  const status = isDocumentStatus(document.status) ? document.status : 'draft';
  const title = displayTitle(document.title);
  const invitedIndex = document.signers.findIndex(
    (signer) => signer.status === 'invited',
  );
  const invited = document.signers[invitedIndex];
  const next = invited ? document.signers[invitedIndex + 1] : undefined;
  const sentAt = document.activity.find(
    (event) => event.type === 'document.published',
  )?.occurredAt;
  const createdAt = document.activity.find(
    (event) => event.type === 'document.created',
  )?.occurredAt;
  const lastActivity =
    document.activity.at(-1)?.occurredAt ?? document.updatedAt;
  const completed = status === 'completed';

  async function copyLink(signer: OwnedSigner) {
    setBusy('link');
    setNotice(null);
    const result = await reissueInviteFn({ data: { signerId: signer.id } });
    setBusy(null);
    if ('error' in result) {
      setNotice({ tone: 'destructive', text: result.error });
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setNotice({
        tone: 'info',
        text: `Link copied. The link ${signer.name} had before no longer works, and a new one was sent.`,
      });
    } catch {
      setNotice({
        tone: 'info',
        text: `The old link no longer works. Copy the new one: ${result.url}`,
      });
    }
    await router.invalidate();
  }

  async function voidIt() {
    setBusy('void');
    const result = await voidDocumentFn({ data: { documentId: document.id } });
    setBusy(null);
    setVoidOpen(false);
    if ('error' in result) {
      setNotice({ tone: 'destructive', text: result.error });
      return;
    }
    setNotice({ tone: 'info', text: 'This document is voided.' });
    await router.invalidate();
  }

  async function downloadSigned() {
    if (!loadSignedPdf) return;
    setBusy('signed');
    setNotice(null);
    const { downloadSignedPdf } = await loadSignedPdf();
    const result = await downloadSignedPdf(document.id, title);
    setBusy(null);
    if ('error' in result) {
      setNotice({
        tone: 'destructive',
        text: `${result.error} You can still download the original.`,
      });
    }
  }

  const subtitle = [
    document.signers.length > 0
      ? `${document.signers.length} ${document.signers.length === 1 ? 'signer' : 'signers'}`
      : '',
    document.pageCount > 0
      ? `${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'}`
      : '',
    sentAt != null ? `Sent ${formatUpdated(sentAt)}` : '',
  ]
    .filter((part) => part.length > 0)
    .join(' · ');

  return (
    <div>
      <Link
        to="/documents"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground no-underline hover:text-foreground"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} />
        Documents
      </Link>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-title font-semibold tracking-tight break-words">
              {title}
            </h1>
            <StatusBadge status={status} />
          </div>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === 'draft' ? (
            <Button asChild size="lg">
              <Link to="/prepare" search={{ documentId: document.id }}>
                Continue editing
              </Link>
            </Button>
          ) : null}
          {completed ? (
            <Button
              type="button"
              size="lg"
              disabled={busy !== null}
              onClick={() => void downloadSigned()}
            >
              <Download strokeWidth={1.75} />
              {busy === 'signed' ? 'Preparing…' : 'Download signed PDF'}
            </Button>
          ) : null}
          {document.uploaded ? (
            <Button asChild variant="outline" size="lg">
              <a href={`/files/documents/${document.id}/source`}>
                <Download strokeWidth={1.75} />
                Download original
              </a>
            </Button>
          ) : null}
          {status === 'in_progress' ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="text-destructive hover:bg-danger-bg hover:text-danger-fg"
              disabled={busy !== null}
              onClick={() => setVoidOpen(true)}
            >
              <Ban strokeWidth={1.75} />
              Void document
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.tone} className="mt-6">
          <AlertDescription className="mt-0 break-words">
            {notice.text}
          </AlertDescription>
        </Alert>
      ) : null}

      <StatusCallout
        status={status}
        document={document}
        invited={invited}
        next={next}
        busy={busy === 'link'}
        onCopy={invited ? () => void copyLink(invited) : undefined}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <SigningOrder signers={document.signers} />
          <ActivityCard
            lines={activityLines(document.activity, document.signers)}
          />
        </div>
        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-subheading font-semibold">Details</h2>
            <dl className="mt-3 border-t border-border text-sm">
              <Detail label="Source file" value={title} />
              {document.pageCount > 0 ? (
                <Detail label="Pages" value={String(document.pageCount)} />
              ) : null}
              {createdAt != null ? (
                <Detail label="Created" value={formatUpdated(createdAt)} />
              ) : null}
              {status === 'in_progress' && document.expiresAt != null ? (
                <Detail
                  label="Expires"
                  value={formatUpdated(document.expiresAt)}
                />
              ) : null}
              <Detail
                label="Last activity"
                value={formatRelative(lastActivity)}
                title={formatWhen(lastActivity)}
              />
              <Detail label="Document ID" value={document.id} />
            </dl>
          </section>
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-muted-foreground"
              >
                <ShieldCheck className="size-5" strokeWidth={1.75} />
              </span>
              <h2 className="text-subheading font-semibold">
                {completed ? 'Check the record' : 'Checkable when finished'}
              </h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {completed
                ? 'The finished PDF carries a record that anyone can check without an account.'
                : 'Once everyone has signed, the finished PDF carries a record that anyone can check without an account.'}
            </p>
            {completed ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/v/$documentId" params={{ documentId: document.id }}>
                  Check this PDF
                </Link>
              </Button>
            ) : null}
          </section>
        </aside>
      </div>

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this document?</AlertDialogTitle>
            <AlertDialogDescription>
              Voiding stops signing for everyone. The current signing link will
              no longer work, and this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep signing open</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy === 'void'}
              onClick={(event) => {
                event.preventDefault();
                void voidIt();
              }}
            >
              {busy === 'void' ? 'Voiding…' : 'Void document'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd title={title} className="min-w-0 text-right break-all">
        {value}
      </dd>
    </div>
  );
}

const CALLOUT_TONE = {
  brand: 'border-brand-soft bg-brand-bg text-brand-fg',
  success: 'border-success/30 bg-success-bg text-success-fg',
  warning: 'border-warning/30 bg-warning-bg text-warning-fg',
  danger: 'border-destructive/30 bg-danger-bg text-danger-fg',
  neutral: 'border-border bg-neutral-bg text-neutral-fg',
} as const;

/** Says where the document stands and what to do next. */
function StatusCallout({
  status,
  document,
  invited,
  next,
  busy,
  onCopy,
}: {
  status: ReturnType<typeof statusOf>;
  document: OwnedDocumentDetail;
  invited: OwnedSigner | undefined;
  next: OwnedSigner | undefined;
  busy: boolean;
  onCopy: (() => void) | undefined;
}) {
  let tone: keyof typeof CALLOUT_TONE = 'neutral';
  let icon: ReactNode = <FileText className="size-5" strokeWidth={1.75} />;
  let heading = '';
  let body: ReactNode = null;
  let note: string | null = null;

  if (status === 'in_progress') {
    tone = 'brand';
    icon = <Clock className="size-5" strokeWidth={1.75} />;
    if (invited?.inviteEmail === 'failed') {
      tone = 'warning';
      icon = <TriangleAlert className="size-5" strokeWidth={1.75} />;
      heading = `We couldn’t email ${invited.name}`;
      body = `The invite to ${invited.email} did not go through after several tries. Copy a new signing link and send it to ${invited.name} yourself. A new email is also attempted when you copy it.`;
      note = `Copying a new link turns off the one ${invited.name} already has.`;
    } else if (invited?.inviteEmail === 'sending') {
      heading = `Sending the invite to ${invited.name}`;
      body = `The email to ${invited.email} is on its way. This page updates by itself.`;
    } else if (invited) {
      heading = `Waiting on ${invited.name}`;
      const when = [
        invited.invitedAt != null
          ? `Invited ${formatRelative(invited.invitedAt)}`
          : 'Invited',
        invited.firstViewedAt != null
          ? `and opened ${formatRelative(invited.firstViewedAt)}`
          : 'and has not opened it yet',
      ].join(' ');
      body = `${when}. ${next ? `${next.name} is invited after they sign.` : 'They are the last person to sign.'}`;
      note = `Copying a new link turns off the one ${invited.name} already has.`;
    } else {
      heading = 'Out for signature';
      body = 'The next person is invited as soon as the one before them signs.';
    }
  } else if (status === 'draft') {
    icon = <FileText className="size-5" strokeWidth={1.75} />;
    heading = 'This document is a draft';
    body =
      'Nothing has been sent. Continue editing to place fields and send it.';
  } else if (status === 'completed') {
    tone = 'success';
    icon = <CircleCheck className="size-5" strokeWidth={1.75} />;
    heading = 'Everyone has signed';
    body = 'The signed PDF is ready to download.';
  } else if (status === 'declined') {
    tone = 'danger';
    icon = <CircleX className="size-5" strokeWidth={1.75} />;
    const decliner = document.signers.find(
      (signer) => signer.status === 'declined',
    );
    heading = decliner ? `${decliner.name} declined` : 'Signing was declined';
    body = decliner?.declineReason ?? 'Signing has stopped.';
  } else if (status === 'expired') {
    tone = 'warning';
    icon = <TriangleAlert className="size-5" strokeWidth={1.75} />;
    heading = 'This document expired';
    body = 'It was not fully signed in time. Signing links no longer work.';
  } else {
    icon = <Ban className="size-5" strokeWidth={1.75} />;
    heading = 'This document is voided';
    body = 'Signing was stopped. Signing links no longer work.';
  }

  return (
    <section
      className={cn('mt-6 rounded-lg border p-5', CALLOUT_TONE[tone])}
      aria-label="Status"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-card"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-subheading font-semibold">{heading}</h2>
          <p className="mt-0.5 text-sm leading-relaxed break-words">{body}</p>
        </div>
        {onCopy ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="shrink-0 bg-card text-foreground"
            disabled={busy}
            onClick={onCopy}
          >
            <Copy strokeWidth={1.75} />
            {busy ? 'Copying…' : 'Copy new signing link'}
          </Button>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-small">{note}</p> : null}
    </section>
  );
}

function statusOf(value: string) {
  return isDocumentStatus(value) ? value : 'draft';
}
