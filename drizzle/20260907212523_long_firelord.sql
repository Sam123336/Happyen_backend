CREATE TYPE "public"."event_category" AS ENUM('music', 'comedy', 'food', 'pets', 'sports', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TABLE "event_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"venue_id" uuid,
	"venue_name" varchar(160) NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_occurrences_end_after_start_ck" CHECK ("event_occurrences"."end_at" IS NULL OR "event_occurrences"."end_at" > "event_occurrences"."start_at")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"category" "event_category" DEFAULT 'other' NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"hero_image_url" text,
	"ticket_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"address" text,
	"foursquare_place_id" varchar(64),
	"location" geography(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrences" ADD CONSTRAINT "event_occurrences_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_occurrences_location_gix" ON "event_occurrences" USING gist ("location");--> statement-breakpoint
CREATE INDEX "event_occurrences_event_start_idx" ON "event_occurrences" USING btree ("event_id","start_at");--> statement-breakpoint
CREATE INDEX "event_occurrences_published_start_idx" ON "event_occurrences" USING btree ("start_at") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "venues_location_gix" ON "venues" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_foursquare_place_id_uq" ON "venues" USING btree ("foursquare_place_id");