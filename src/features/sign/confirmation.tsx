import { Link } from '@tanstack/react-router';
import {
  CircleCheck,
  Download,
  Send,
  ShieldCheck,
  UserRoundX,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from '#/components/ui/button.tsx';
import { buildManifest } from '#/features/sign/manifest.ts';
import type { SignerRecord } from '#/features/sign/session.ts';
import { SignerPage } from '#/features/sign/signer-status.tsx';
import { cn } from '#/lib/utils.ts';
import { loadScriptFonts } from '#/pdf/fonts.ts';
import { render } from '#/pdf/render.ts';
import type { SigningView } from '#/server/domain/signing.ts';

const WHEN = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const WHEN_ZONE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

type Common = {
  title: string;
  documentId: string;
  youName: string;
  senderName: string;
  senderEmail: string;
};

export type ConfirmationProps =
  | {
      kind: 'signed';
      common: Common;
      signedAt: number;
      nextSignerName: string | null;
    }
  | {
      kind: 'waiting';
      common: Common;
      youOrder: number;
      signedAt: number;
      nextSignerName: string | null;
      others: Extract<SigningView, { kind: 'signed-waiting' }>['others'];
    }
  | {
      kind: 'complete';
      common: Common;
      youId: string;
      completedAt: number;
      records: SignerRecord[];
      /** The completed view and original PDF, which the signed PDF is rendered from. */
      source: {
        view: Extract<SigningView, { kind: 'completed' }>;
        bytes: Uint8Array;
      } | null;
    }
  | {
      kind: 'declined';
      common: Common;
      declinedAt: number | null;
      reason: string | null;
    };

const FOOTNOTE: Record<ConfirmationProps['kind'], (common: Common) => string> =
  {
    signed: () => 'You can close this page now.',
    waiting: () => 'You can close this page now.',
    complete: () =>
      'Keep a copy of the signed PDF. It is the version you can check later.',
    declined: (common) =>
      `This can't be undone. If this was a mistake, ask ${common.senderName || 'the sender'} to send the document again.`,
  };

export function Confirmation(props: ConfirmationProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const { common } = props;
  const sender = common.senderName || 'the sender';
  const copy = headline(props, sender);
  return (
    <SignerPage wide>
      <output className="flex flex-col gap-4">
        <div className="text-center">
          <span
            className={cn(
              'mx-auto grid size-16 place-items-center rounded-full',
              props.kind === 'declined'
                ? 'bg-neutral-bg text-neutral-fg'
                : 'bg-success-bg text-success-fg',
            )}
          >
            {props.kind === 'declined' ? (
              <UserRoundX
                aria-hidden="true"
                className="size-7"
                strokeWidth={1.75}
              />
            ) : (
              <CircleCheck
                aria-hidden="true"
                className="size-7"
                strokeWidth={1.75}
              />
            )}
          </span>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mt-4 text-title font-semibold tracking-tight text-foreground outline-none"
          >
            {copy.title}
          </h1>
          <p className="mt-2 text-muted-foreground">{copy.text}</p>
        </div>
        <Rows rows={rowsFor(props)} />
        {props.kind === 'declined' && props.reason ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              The reason you gave
            </h2>
            <p className="mt-2 break-words whitespace-pre-wrap text-foreground">
              {props.reason}
            </p>
          </div>
        ) : null}
        <Timeline props={props} sender={sender} />
        {props.kind === 'complete' ? <CompleteActions {...props} /> : null}
        <p className="text-center text-small text-muted-foreground">
          {FOOTNOTE[props.kind](common)}
        </p>
      </output>
    </SignerPage>
  );
}

function headline(
  props: ConfirmationProps,
  sender: string,
): { title: string; text: string } {
  const { title } = props.common;
  switch (props.kind) {
    case 'signed':
      return {
        title: 'Your signature is recorded',
        text: `Thank you. You have signed ${title}. Nothing more is needed from you.`,
      };
    case 'waiting':
      return {
        title: "You've already signed",
        text: props.nextSignerName
          ? `Nothing more is needed from you. ${props.nextSignerName} hasn't signed yet.`
          : 'Nothing more is needed from you.',
      };
    case 'complete':
      return {
        title: 'Everyone has signed',
        text: `Your signature completed ${title}. Everyone involved is being emailed.`,
      };
    case 'declined':
      return {
        title: 'You declined to sign',
        text: `Signing has stopped for everyone. ${sender} and the other signers have been told.`,
      };
  }
}

function rowsFor(props: ConfirmationProps): [string, string][] {
  const { common } = props;
  const rows: [string, string][] = [
    ['Document', common.title],
    [props.kind === 'declined' ? 'Declined as' : 'Signed as', common.youName],
  ];
  if (props.kind === 'complete') {
    rows.push(['Completed at', WHEN_ZONE.format(new Date(props.completedAt))]);
  } else if (props.kind === 'declined') {
    if (props.declinedAt != null) {
      rows.push(['Declined at', WHEN_ZONE.format(new Date(props.declinedAt))]);
    }
  } else {
    rows.push(['Signed at', WHEN_ZONE.format(new Date(props.signedAt))]);
  }
  rows.push(['Reference', common.documentId]);
  return rows;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map(([term, value]) => (
        <div
          key={term}
          className="flex items-baseline justify-between gap-4 px-4 py-3 sm:px-5"
        >
          <dt className="text-sm text-muted-foreground">{term}</dt>
          <dd className="min-w-0 text-right font-medium break-all text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Step = {
  state: 'done' | 'sent' | 'todo';
  title: string;
  text?: string;
};

function stepsFor(
  props: ConfirmationProps,
): { label: string; steps: Step[] } | null {
  if (props.kind === 'signed') {
    const steps: Step[] = [
      {
        state: 'done',
        title: 'You signed',
        text: WHEN.format(new Date(props.signedAt)),
      },
    ];
    if (props.nextSignerName) {
      steps.push({
        state: 'sent',
        title: `${props.nextSignerName} has been asked to sign`,
        text: 'We emailed them a link. Documents are signed one person at a time.',
      });
    }
    steps.push({
      state: 'todo',
      title: 'Everyone has signed',
      text: 'You will get an email with a link to check the finished document.',
    });
    return { label: 'What happens next', steps };
  }
  if (props.kind === 'waiting') {
    const people: Step[] = [...props.others]
      .sort((left, right) => left.order - right.order)
      .map((other) => ({
        state:
          other.status === 'signed'
            ? 'done'
            : other.status === 'invited'
              ? 'sent'
              : 'todo',
        title:
          other.status === 'signed'
            ? `${other.name} signed`
            : other.status === 'invited'
              ? `${other.name} has been asked to sign`
              : `${other.name} will be asked after`,
      }));
    const before = props.others.filter(
      (other) => other.order < props.youOrder,
    ).length;
    people.splice(before, 0, {
      state: 'done',
      title: 'You signed',
      text: WHEN.format(new Date(props.signedAt)),
    });
    return { label: 'Status', steps: people };
  }
  if (props.kind === 'complete') {
    const steps: Step[] = props.records.map((record) => ({
      state: 'done' as const,
      title:
        record.signerId === props.youId
          ? 'You signed'
          : `${record.name ?? 'A signer'} signed`,
      text: WHEN.format(new Date(record.signedAt)),
    }));
    steps.push({
      state: 'done',
      title: 'Document complete',
      text: 'Anyone with the signed PDF can check it on DigiSign.',
    });
    return { label: 'Status', steps };
  }
  return null;
}

function Timeline({ props }: { props: ConfirmationProps; sender: string }) {
  const timeline = stepsFor(props);
  if (!timeline) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {timeline.label}
      </h2>
      <ol className="mt-3">
        {timeline.steps.map((step, index) => (
          <li
            key={`${step.title}-${step.text ?? ''}`}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {index < timeline.steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-7 bottom-0 left-[13px] w-px bg-border"
              />
            ) : null}
            <span className="mt-0.5 shrink-0">
              {step.state === 'done' ? (
                <CircleCheck
                  aria-hidden="true"
                  className="size-7 text-success"
                  strokeWidth={1.5}
                />
              ) : step.state === 'sent' ? (
                <Send
                  aria-hidden="true"
                  className="size-7 p-1 text-primary"
                  strokeWidth={1.5}
                />
              ) : (
                <span className="block size-7 rounded-full border-2 border-input" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  'font-semibold',
                  step.state === 'todo'
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {step.title}
                <span className="sr-only">
                  {step.state === 'done'
                    ? ' (done)'
                    : step.state === 'sent'
                      ? ' (in progress)'
                      : ' (later)'}
                </span>
              </p>
              {step.text ? (
                <p className="text-sm text-muted-foreground">{step.text}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

type PdfState =
  | { phase: 'preparing' }
  | { phase: 'ready'; bytes: Uint8Array }
  | { phase: 'failed'; message: string };

/** The signed PDF is drawn here, in the browser, from the original and every signer's record. */
function useSignedPdf(
  source: ConfirmationProps & { kind: 'complete' },
): PdfState {
  const [state, setState] = useState<PdfState>({ phase: 'preparing' });
  useEffect(() => {
    if (!source.source) {
      setState({
        phase: 'failed',
        message: 'The prepared PDF is no longer available.',
      });
      return;
    }
    const { view, bytes } = source.source;
    let cancelled = false;
    void (async () => {
      const manifest = await buildManifest({
        fileName: view.fileName,
        upload: view.upload,
        layout: view.layout,
        signers: [],
        records: view.records,
      });
      const signed = await render(bytes, manifest, {
        fonts: await loadScriptFonts(),
        verifyOrigin: window.location.origin,
      });
      if (!cancelled) setState({ phase: 'ready', bytes: signed });
    })().catch((caught: unknown) => {
      if (cancelled) return;
      setState({
        phase: 'failed',
        message:
          caught instanceof Error
            ? caught.message
            : 'The signed PDF could not be prepared.',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [source.source]);
  return state;
}

function CompleteActions(props: ConfirmationProps & { kind: 'complete' }) {
  const pdf = useSignedPdf(props);
  const ready = pdf.phase === 'ready';
  let status: ReactNode = null;
  if (pdf.phase === 'preparing') status = 'Preparing the signed PDF…';
  if (pdf.phase === 'failed') status = pdf.message;
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="h-12 w-full text-base"
        aria-disabled={!ready}
        onClick={() => {
          if (pdf.phase === 'ready') {
            downloadPdf(pdf.bytes, props.common.title);
          }
        }}
      >
        <Download aria-hidden="true" className="size-5" />
        Download signed PDF
      </Button>
      {status ? (
        <output className="block text-center text-small text-muted-foreground">
          {status}
        </output>
      ) : null}
      <Button asChild variant="outline" className="h-12 w-full text-base">
        <Link
          to="/v/$documentId"
          params={{ documentId: props.common.documentId }}
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
          Check the signed record
        </Link>
      </Button>
    </div>
  );
}

function downloadPdf(bytes: Uint8Array, title: string): void {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const url = URL.createObjectURL(
    new Blob([copy], { type: 'application/pdf' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/\.pdf$/i, '')}-signed.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
