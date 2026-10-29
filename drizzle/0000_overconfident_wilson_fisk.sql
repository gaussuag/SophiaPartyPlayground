CREATE TABLE `events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`updated_at` text NOT NULL
);
