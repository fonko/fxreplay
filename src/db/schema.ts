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
});

// TODO once Supabase MCP reconnects and this migration is applied:
//   ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
//   -- inserts only via the server-side service role (this table is written
//   -- from the signup Astro Action, never directly from client code).
