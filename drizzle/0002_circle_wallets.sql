ALTER TABLE `agents` ADD `wallet_provider` text DEFAULT 'external' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `wallet_chain_id` integer DEFAULT 5042 NOT NULL;--> statement-breakpoint
ALTER TABLE `challenges` ADD `wallet_provider` text DEFAULT 'external' NOT NULL;--> statement-breakpoint
ALTER TABLE `challenges` ADD `wallet_chain_id` integer DEFAULT 5042 NOT NULL;