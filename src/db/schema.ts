import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Postgres 16 has no built-in uuidv7() — generated app-side here. Revisit if
// the `pg_uuidv7` extension is later enabled on the Supabase project.
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  email: text("email").notNull().unique(),
  name: text("name"),
  variantId: text("variant_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// RLS is enabled in drizzle/0000_uneven_jazinda.sql with no policies: writes
// only happen server-side via DATABASE_URL (superuser, bypasses RLS), and
// this keeps the row-level data out of Supabase's public PostgREST Data API.
