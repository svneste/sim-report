CREATE TABLE IF NOT EXISTS "yandex_sites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"name" text NOT NULL,
	"counter_id" bigint NOT NULL,
	"goal_id" bigint,
	"domain" text,
	"amocrm_pipeline_id" bigint,
	"amocrm_page_field_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
