ALTER TABLE `documents` ADD `kind` text DEFAULT 'document' NOT NULL CONSTRAINT "documents_kind_ck" CHECK(`kind` IN ('document', 'template'));
