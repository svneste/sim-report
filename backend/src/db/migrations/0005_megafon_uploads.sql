CREATE TABLE IF NOT EXISTS "megafon_uploads" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"filename" text NOT NULL,
	"period" integer NOT NULL,
	"contract_id" text,
	"row_count" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
