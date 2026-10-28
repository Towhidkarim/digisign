CREATE TABLE `saved_signatures` (
	`user_id` text PRIMARY KEY NOT NULL,
	`signature_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
