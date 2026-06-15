CREATE TABLE IF NOT EXISTS "lead_status_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" bigint NOT NULL,
	"status_id" bigint NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "megafon_report_rows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "megafon_report_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
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
CREATE TABLE IF NOT EXISTS "megafon_uploads" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "megafon_uploads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"filename" text NOT NULL,
	"period" integer NOT NULL,
	"contract_id" text,
	"row_count" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"payment_date" date NOT NULL,
	"title" text,
	"company_name" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yandex_client_names" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "yandex_client_names_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yandex_sites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "yandex_sites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"counter_id" bigint NOT NULL,
	"goal_id" bigint,
	"domain" text,
	"amocrm_pipeline_id" bigint,
	"amocrm_page_field_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yandex_client_names" ADD CONSTRAINT "yandex_client_names_site_id_yandex_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."yandex_sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lst_status_occurred_idx" ON "lead_status_transitions" USING btree ("status_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lst_deal_idx" ON "lead_status_transitions" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_period_idx" ON "megafon_report_rows" USING btree ("period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_agent_idx" ON "megafon_report_rows" USING btree ("agent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_segment_idx" ON "megafon_report_rows" USING btree ("segment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfr_sub_idx" ON "megafon_report_rows" USING btree ("period","subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_type_idx" ON "payments" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_date_idx" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yandex_client_names_site_slug_uniq" ON "yandex_client_names" USING btree ("site_id","slug");