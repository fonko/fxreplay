CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_leads_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Same rationale as leads (see 0000_uneven_jazinda.sql): app writes go
-- through DATABASE_URL directly, this just keeps PostgREST from exposing
-- token hashes via the public anon key.
ALTER TABLE "magic_links" ENABLE ROW LEVEL SECURITY;