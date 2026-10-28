ALTER TABLE `documents` ADD `delivery` text DEFAULT 'email' NOT NULL CONSTRAINT "documents_delivery_ck" CHECK(`delivery` IN ('email', 'link'));
