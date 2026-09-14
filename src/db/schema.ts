import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Postgres 16 has no built-in uuidv7() — generated app-side here. Revisit if
// the `pg_uuidv7` extension is later enabled on the Supabase project.
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  email: text("email").notNull().unique(),
  name: text("name"),
  variantId: text("variant_id"),
  // First-touch attribution, captured server-side in middleware.ts from the
  // landing request's query string (see the ph_utm cookie) — not resent by
  // the signup form itself, so it's still correct if the user converts on a
  // later visit with no query params.
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  // Snapshot at signup time from the ph_visit_count/ph_first_seen_at cookies
  // (middleware.ts) — cheap admin-table columns that don't need a live
  // PostHog query. The full event-by-event journey (including everything
  // that happened anonymously) is fetched on demand instead, via
  // src/lib/posthog/query.ts, since that only lives in PostHog.
  visitCount: integer("visit_count"),
  conversionTimeSeconds: integer("conversion_time_seconds"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Single-use, short-lived magic-link tokens for email confirmation. Only the
// SHA-256 hash is stored — the raw token (in the emailed URL) never touches
// the database, so a DB read doesn't hand out a usable link.
export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  userId: uuid("user_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// RLS is enabled (leads in drizzle/0000_uneven_jazinda.sql, magic_links in
// its own migration) with no policies: writes only happen server-side via
// DATABASE_URL (superuser, bypasses RLS), and this keeps both tables out of
// Supabase's public PostgREST Data API.
