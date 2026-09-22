CREATE TABLE `investment_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_item_id` text,
	`symbol` text NOT NULL,
	`name` text,
	`instrument_kind` text NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`quantity` text DEFAULT '0' NOT NULL,
	`avg_cost_price` text,
	`cost_basis_amount` text,
	`realized_pnl_amount` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`asset_item_id`) REFERENCES `asset_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_investment_positions_symbol` ON `investment_positions` (`symbol`);--> statement-breakpoint
CREATE INDEX `idx_investment_positions_account` ON `investment_positions` (`asset_item_id`);--> statement-breakpoint
CREATE INDEX `idx_investment_positions_status` ON `investment_positions` (`status`);--> statement-breakpoint
CREATE TABLE `investment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`position_id` text NOT NULL,
	`side` text NOT NULL,
	`quantity` text NOT NULL,
	`price` text NOT NULL,
	`fee_amount` text,
	`executed_at` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `investment_positions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_investment_transactions_position` ON `investment_transactions` (`position_id`);--> statement-breakpoint
CREATE INDEX `idx_investment_transactions_executed` ON `investment_transactions` (`executed_at`);--> statement-breakpoint
CREATE TABLE `price_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`price` text NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`quoted_at` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `idx_price_quotes_symbol` ON `price_quotes` (`symbol`,`quoted_at`);