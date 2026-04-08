CREATE TABLE IF NOT EXISTS "lead_status_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" bigint NOT NULL,
	"status_id" bigint NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lst_status_occurred_idx" ON "lead_status_transitions" ("status_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lst_deal_idx" ON "lead_status_transitions" ("deal_id");
