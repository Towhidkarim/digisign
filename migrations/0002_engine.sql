-- Partial indexes for the cron sweeper. Each one matches an EXISTS in the idle check,
-- so a minute with nothing to do costs one cheap read. Like the triggers in 0001, these
-- are custom SQL; the table definitions are unchanged.

CREATE INDEX `documents_anchor_idx` ON `documents` (`completed_at`) WHERE `status` = 'completed' AND `anchored_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `documents_expiry_idx` ON `documents` (`expires_at`) WHERE `status` = 'in_progress';
--> statement-breakpoint
CREATE INDEX `documents_stalled_idx` ON `documents` (`updated_at`) WHERE `status` = 'in_progress';
--> statement-breakpoint
CREATE INDEX `signers_invited_idx` ON `signers` (`invited_at`) WHERE `status` = 'invited';
--> statement-breakpoint
CREATE INDEX `signers_pending_idx` ON `signers` (`document_id`) WHERE `status` = 'pending';
--> statement-breakpoint
CREATE INDEX `blob_intents_created_idx` ON `blob_intents` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_created_idx` ON `idempotency_keys` (`created_at`);
--> statement-breakpoint
CREATE INDEX `inbox_processed_idx` ON `inbox` (`processed_at`);
--> statement-breakpoint
CREATE INDEX `signer_sessions_expiry_idx` ON `signer_sessions` (`expires_at`);
