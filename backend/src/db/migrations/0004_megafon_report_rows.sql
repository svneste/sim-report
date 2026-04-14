CREATE TABLE IF NOT EXISTS "megafon_report_rows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"period" integer NOT NULL,
	"agent" text NOT NULL,
	"contract_id" text,
	"client_name" text,
	"client_inn" text,
	"segment" text,
	"phone_activation" text,
	"phone_current" text,
	"subscriber_id" text,
	"activation_date" timestamp with time zone,
	"registration_date" date,
	"tariff_activation" text,
	"tariff_current" text,
	"point_of_sale" text,
	"charges_total" integer,
	"charges_prev" integer,
	"charges_month" integer,
	"reward_prev" integer,
	"reward_rate" integer,
	"reward_month" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_period_idx" ON "megafon_report_rows" ("period");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_agent_idx" ON "megafon_report_rows" ("agent");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_segment_idx" ON "megafon_report_rows" ("segment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_sub_idx" ON "megafon_report_rows" ("period", "subscriber_id");
