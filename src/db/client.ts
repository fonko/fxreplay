import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// prepare: false is required for Supabase's Supavisor transaction pool mode.
const client = postgres(import.meta.env.DATABASE_URL, { prepare: false });
export const db = drizzle({ client });
