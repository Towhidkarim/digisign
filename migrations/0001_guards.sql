-- Status and numeric bound CHECKs are declared on the tables in 0000_signing.
-- SQLite cannot add a CHECK to an existing table, so they live in that CREATE.
-- This migration adds the partial unique index and the database triggers.

CREATE UNIQUE INDEX `signers_email_uq` ON `signers` (`document_id`, `email`) WHERE length(`email`) > 0;
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_signer` ON `signers` (`document_id`) WHERE `status` = 'invited';
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_update`
BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete`
BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `documents_freeze_layout`
BEFORE UPDATE OF `source_r2_key`, `source_sha256`, `source_size`, `geometry_json`, `geometry_sha256`, `layout_json`, `layout_version`, `layout_sha256` ON `documents`
WHEN OLD.`status` != 'draft'
BEGIN
	SELECT RAISE(ABORT, 'layout is frozen');
END;
--> statement-breakpoint
CREATE TRIGGER `signers_freeze_identity`
BEFORE UPDATE OF `email`, `name`, `signing_order` ON `signers`
WHEN (SELECT `status` FROM `documents` WHERE `id` = OLD.`document_id`) != 'draft'
BEGIN
	SELECT RAISE(ABORT, 'signer identity is frozen');
END;
--> statement-breakpoint
CREATE TRIGGER `documents_fsm_status`
BEFORE UPDATE OF `status` ON `documents`
WHEN NOT (
	(OLD.`status` = 'draft' AND NEW.`status` = 'in_progress')
	OR (OLD.`status` = 'in_progress' AND NEW.`status` IN ('completed', 'declined', 'voided', 'expired'))
	OR OLD.`status` = NEW.`status`
)
BEGIN
	SELECT RAISE(ABORT, 'illegal document transition');
END;
--> statement-breakpoint
CREATE TRIGGER `signers_fsm_status`
BEFORE UPDATE OF `status` ON `signers`
WHEN NOT (
	(OLD.`status` = 'pending' AND NEW.`status` IN ('invited', 'voided'))
	OR (OLD.`status` = 'invited' AND NEW.`status` IN ('signed', 'declined', 'voided'))
	OR OLD.`status` = NEW.`status`
)
BEGIN
	SELECT RAISE(ABORT, 'illegal signer transition');
END;
