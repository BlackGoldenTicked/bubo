CREATE TABLE `contract_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`margin_mode` text DEFAULT 'isolated' NOT NULL,
	`leverage_bps` integer DEFAULT 10000 NOT NULL,
	`quantity` text NOT NULL,
	`entry_price` text NOT NULL,
	`mark_price` text,
	`exit_price` text,
	`liquidation_price` text,
	`margin_amount` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contract_positions_symbol` ON `contract_positions` (`symbol`);--> statement-breakpoint
CREATE INDEX `idx_contract_positions_status` ON `contract_positions` (`status`);