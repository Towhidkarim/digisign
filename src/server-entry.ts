import handler from "@tanstack/react-start/server-entry";

import { insertProbe } from "#/db/probes.ts";

import type { QueueProbeMessage } from "#/server/queue-message.ts";

export default {
	fetch: handler.fetch,
	async queue(batch: MessageBatch<QueueProbeMessage>) {
		for (const message of batch.messages) {
			const note =
				typeof message.body?.note === "string" ? message.body.note : "";
			await insertProbe("queue", note);
			message.ack();
		}
	},
	async scheduled(controller: ScheduledController) {
		await insertProbe(
			"cron",
			JSON.stringify({
				cron: controller.cron,
				scheduledTime: controller.scheduledTime,
			}),
		);
	},
};
