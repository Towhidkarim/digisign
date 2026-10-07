import { env } from 'cloudflare:workers';
import handler from '@tanstack/react-start/server-entry';

import {
  handleDeadLetterBatch,
  handleEventBatch,
} from '#/server/engine/consumer.ts';
import { runSweeper } from '#/server/engine/sweeper.ts';
import { crossSiteRejection, withSecurityHeaders } from '#/server/security.ts';

export default {
  async fetch(request: Request, ...rest: unknown[]) {
    const blocked = crossSiteRejection(request, env.APP_ORIGIN);
    if (blocked) return withSecurityHeaders(blocked, request);
    const response = await (
      handler.fetch as (...args: unknown[]) => Promise<Response>
    )(request, ...rest);
    return withSecurityHeaders(response, request);
  },
  async queue(batch: MessageBatch<unknown>) {
    if (batch.queue === 'ds-dlq') {
      await handleDeadLetterBatch(batch);
      return;
    }
    await handleEventBatch(batch);
  },
  async scheduled() {
    const report = await runSweeper();
    if (!report.idle) console.log('[sweeper]', JSON.stringify(report));
  },
};
