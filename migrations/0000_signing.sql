CREATE TABLE `_assert` (
	`ok` integer NOT NULL,
	CONSTRAINT "assert_ok_ck" CHECK("_assert"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`document_id` text NOT NULL,
	`seq` integer NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	`prev_hash` text NOT NULL,
	`hash` text NOT NULL,
	PRIMARY KEY(`document_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `blob_intents` (
	`r2_key` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dead_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`body_json` text NOT NULL,
	`attempts` integer NOT NULL,
	`error` text NOT NULL,
	`created_at` integer NOT NULL,
	`replayed_at` integer
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`source_r2_key` text,
	`source_sha256` text,
	`source_size` integer,
	`page_count` integer DEFAULT 0 NOT NULL,
	`geometry_json` text,
	`geometry_sha256` text,
	`layout_json` text,
	`layout_version` integer DEFAULT 0 NOT NULL,
	`layout_sha256` text,
	`manifest_json` text,
	`manifest_sha256` text,
	`manifest_r2_key` text,
	`anchored_at` integer,
	`expires_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`last_op_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT "documents_status_ck" CHECK("documents"."status" IN ('draft', 'in_progress', 'completed', 'declined', 'voided', 'expired')),
	CONSTRAINT "documents_upload_status_ck" CHECK("documents"."upload_status" IN ('pending', 'uploaded', 'rejected')),
	CONSTRAINT "documents_page_count_ck" CHECK("documents"."page_count" BETWEEN 0 AND 200),
	CONSTRAINT "documents_layout_version_ck" CHECK("documents"."layout_version" >= 0),
	CONSTRAINT "documents_version_ck" CHECK("documents"."version" >= 0),
	CONSTRAINT "documents_source_size_ck" CHECK("documents"."source_size" IS NULL OR ("documents"."source_size" > 0 AND "documents"."source_size" <= 26214400))
);
--> statement-breakpoint
CREATE INDEX `documents_owner_id_idx` ON `documents` (`owner_id`);--> statement-breakpoint
CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`to_addr` text NOT NULL,
	`template` text NOT NULL,
	`status` text NOT NULL,
	`claimed_until` integer,
	`provider_message_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "email_deliveries_status_ck" CHECK("email_deliveries"."status" IN ('claimed', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_deliveries_event_recipient_uq` ON `email_deliveries` (`event_id`,`to_addr`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`actor_key` text NOT NULL,
	`key` text NOT NULL,
	`request_sha256` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`actor_key`, `key`)
);
--> statement-breakpoint
CREATE TABLE `inbox` (
	`consumer` text NOT NULL,
	`event_id` text NOT NULL,
	`processed_at` integer NOT NULL,
	PRIMARY KEY(`consumer`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`type` text NOT NULL,
	`document_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	CONSTRAINT "outbox_status_ck" CHECK("outbox"."status" IN ('pending', 'published'))
);
--> statement-breakpoint
CREATE INDEX `outbox_status_available_idx` ON `outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `runtime_probes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signer_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`signer_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`idle_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signer_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`signer_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signers` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`signing_order` integer NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_at` integer,
	`first_viewed_at` integer,
	`signed_at` integer,
	`decline_reason` text,
	`evidence_r2_key` text,
	`evidence_sha256` text,
	`consent_at` integer,
	`client_ip` text,
	`user_agent` text,
	`version` integer DEFAULT 0 NOT NULL,
	`last_op_id` text,
	CONSTRAINT "signers_status_ck" CHECK("signers"."status" IN ('pending', 'invited', 'signed', 'declined', 'voided')),
	CONSTRAINT "signers_order_ck" CHECK("signers"."signing_order" BETWEEN 1 AND 10),
	CONSTRAINT "signers_version_ck" CHECK("signers"."version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signers_document_order_uq` ON `signers` (`document_id`,`signing_order`);