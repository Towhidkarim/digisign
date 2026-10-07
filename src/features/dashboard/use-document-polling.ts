import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { nextPollDelay } from '#/features/dashboard/polling.ts';

/**
 * Refreshes the page's data on a schedule (see `nextPollDelay`). `version` must change each time
 * new data arrives, so the next check is planned from the latest state. It pauses while the tab
 * is hidden and refreshes as soon as the tab is shown again.
 */
export function useDocumentPolling(input: {
  version: unknown;
  status: string;
  busy: boolean;
  failed: boolean;
}) {
  const router = useRouter();
  const busySince = useRef<number | null>(null);
  const failures = useRef(0);

  useEffect(() => {
    const refresh = () => void router.invalidate();
    const onShow = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [router]);

  useEffect(() => {
    void input.version;
    const now = Date.now();
    if (input.busy) busySince.current ??= now;
    else busySince.current = null;
    failures.current = input.failed ? failures.current + 1 : 0;
    const delay = nextPollDelay({
      status: input.status,
      busy: input.busy,
      busyForMs: busySince.current == null ? 0 : now - busySince.current,
      failures: failures.current,
    });
    if (delay == null) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') void router.invalidate();
    }, delay);
    return () => clearTimeout(timer);
  }, [input.version, input.status, input.busy, input.failed, router]);
}
