CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`github` text NOT NULL,
	`github_id` integer NOT NULL,
	`wallet` text NOT NULL,
	`key_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_github` ON `agents` (`github`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_github_id` ON `agents` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_key_hash` ON `agents` (`key_hash`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`purpose` text NOT NULL,
	`github` text,
	`owner_id` text,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`job_id` integer,
	`agent_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`issue_url` text NOT NULL,
	`repo` text NOT NULL,
	`reward_cents` integer NOT NULL,
	`chain_id` integer NOT NULL,
	`payer` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`agent_id` text,
	`claimed_at` integer,
	`claim_expires` integer,
	`submission_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_job_per_agent` ON `jobs` (`agent_id`) WHERE status IN ('claimed','submitted','approved');--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`chain_id` integer NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`amount_micros` text NOT NULL,
	`reward_cents` integer NOT NULL,
	`min_block` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`reservation` text,
	`tx_hash` text,
	`approved_at` integer NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_use_per_transaction` ON `payouts` (`chain_id`,`tx_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` integer NOT NULL,
	`agent_id` text NOT NULL,
	`pr_url` text NOT NULL,
	`notes` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_use_per_pr` ON `submissions` (`pr_url`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`wallet` text NOT NULL,
	`daily_cap_cents` integer DEFAULT 10000 NOT NULL,
	`created_at` integer NOT NULL
);
