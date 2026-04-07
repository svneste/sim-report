CREATE TABLE IF NOT EXISTS "amocrm_deals" (
	"id" bigint PRIMARY KEY NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"status_id" bigint,
	"responsible_user_id" bigint,
	"name" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "amocrm_tokens" (
	"subdomain" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "amocrm_users" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sim_registrations" (
	"deal_id" bigint NOT NULL,
	"responsible_user_id" bigint NOT NULL,
	"registered_on" date NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sim_registrations_deal_id_pk" PRIMARY KEY("deal_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_pipeline_idx" ON "amocrm_deals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_responsible_idx" ON "amocrm_deals" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sim_user_idx" ON "sim_registrations" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sim_date_idx" ON "sim_registrations" USING btree ("registered_on");