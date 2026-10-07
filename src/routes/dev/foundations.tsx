import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '#/components/ui/button.tsx';
import { Input } from '#/components/ui/input.tsx';
import {
  listProbes,
  saveFile,
  sendQueueMessage,
  writeDatabaseRow,
} from '#/server/foundations.ts';

export const Route = createFileRoute('/dev/foundations')({
  component: FoundationsPage,
});

type ProbeRow = {
  id: number;
  kind: string;
  payload: string;
  createdAt: number;
};

function FoundationsPage() {
  const [note, setNote] = useState('Local check');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ProbeRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh(afterId = 0, kind?: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const next = await listProbes();
      setRows(next);
      if (!kind || next.some((row) => row.id > afterId && row.kind === kind))
        return next;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      'The service accepted the request, but no new row appeared. Try again.',
    );
  }

  function requireNote() {
    if (note.trim()) return true;
    setStatus('');
    setError('Enter a note, then try again.');
    return false;
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      setStatus(await action());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The request failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sheet">
      <p className="wordmark">DigiSign</p>
      <h1 className="doc-title">Local services</h1>
      <p>
        These checks talk to the database, file storage, the queue, and the
        schedule on this machine.
      </p>
      <p>
        <Link to="/">Back home</Link>
      </p>
      <label className="mt-6 block" htmlFor="probe-note">
        Note
        <Input
          id="probe-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          className="mt-2"
        />
      </label>
      <div className="sheet-actions">
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!requireNote()) return;
            void run(async () => {
              await writeDatabaseRow({ data: { note } });
              await refresh();
              return 'Wrote a database row.';
            });
          }}
        >
          Write a database row
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (!requireNote()) return;
            void run(async () => {
              const saved = await saveFile({ data: { note } });
              return `Read the file back: ${saved.text}`;
            });
          }}
        >
          Save a file
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (!requireNote()) return;
            void run(async () => {
              const before = await listProbes();
              const afterId = before[0]?.id ?? 0;
              setRows(before);
              await sendQueueMessage({ data: { note } });
              await refresh(afterId, 'queue');
              return 'The queue delivered the message.';
            });
          }}
        >
          Send a queue message
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const before = await listProbes();
              const afterId = before[0]?.id ?? 0;
              setRows(before);
              const response = await fetch(
                '/cdn-cgi/local/scheduled?cron=*+*+*+*+*&format=json',
              );
              if (!response.ok) {
                throw new Error('The schedule did not run. Try again.');
              }
              await refresh(afterId, 'cron');
              return 'The schedule ran.';
            });
          }}
        >
          Run the schedule
        </Button>
      </div>
      <p className={error ? 'status-line is-error' : 'status-line'}>
        {error || status}
      </p>
      {rows.length > 0 ? (
        <ul className="probe-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.kind}</span>
              <span>{row.payload}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
