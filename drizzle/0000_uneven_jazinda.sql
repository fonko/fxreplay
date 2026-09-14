CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"variant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- No policies are defined on purpose: the app writes via a direct Postgres
-- connection (DATABASE_URL, superuser role, bypasses RLS by design), while
-- this blocks Supabase's auto-generated PostgREST Data API — which honors
-- RLS and would otherwise let the public anon key read/write `leads`.
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
