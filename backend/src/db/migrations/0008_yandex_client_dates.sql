ALTER TABLE "yandex_client_names" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "yandex_client_names" ADD COLUMN "created_date" date;--> statement-breakpoint
ALTER TABLE "yandex_client_names" ADD COLUMN "launch_date" date;