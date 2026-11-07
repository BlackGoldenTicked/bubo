CREATE TABLE `card_images` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`side` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_images_card_side_unique` ON `card_images` (`card_id`,`side`);--> statement-breakpoint
CREATE INDEX `idx_card_images_card` ON `card_images` (`card_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`bank` text NOT NULL,
	`card_type` text DEFAULT 'debit' NOT NULL,
	`brand` text DEFAULT 'unionpay' NOT NULL,
	`number_last4` text,
	`holder_name` text,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`credit_limit` text,
	`billing_day` integer,
	`repayment_day` integer,
	`expiry_month` integer,
	`expiry_year` integer,
	`color_hex` text,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cards_status` ON `cards` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cards_bank` ON `cards` (`bank`);--> statement-breakpoint
CREATE INDEX `idx_cards_order` ON `cards` (`display_order`);
