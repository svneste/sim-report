CREATE TABLE IF NOT EXISTS "payments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"payment_date" date NOT NULL,
	"title" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_type_idx" ON "payments" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_date_idx" ON "payments" ("payment_date");
