import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { leads } from "../../db/schema";

export interface CreateUserInput {
  email: string;
  name?: string;
  variantId: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  visitCount?: number;
  conversionTimeSeconds?: number;
}

export interface UpdateUserInput {
  name?: string;
}

export async function createUser(input: CreateUserInput) {
  const [existing] = await db.select().from(leads).where(eq(leads.email, input.email)).limit(1);
  if (existing) {
    return { user: existing, alreadyExisted: true as const };
  }

  const [user] = await db.insert(leads).values(input).returning();
  return { user, alreadyExisted: false as const };
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const [user] = await db.update(leads).set(input).where(eq(leads.id, id)).returning();
  return user ?? null;
}

export async function listUsers({ limit = 50 }: { limit?: number } = {}) {
  return db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit);
}

export async function deleteUser(id: string) {
  const [user] = await db.delete(leads).where(eq(leads.id, id)).returning();
  return user ?? null;
}

// Postgres-only, no PostHog round trip: every account_created is a `leads`
// row, and email_verified_at is set by the magic-link confirm flow, so this
// is a plain aggregate — unlike the funnel overview, which needs PostHog.
export async function getEmailConfirmationStats() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      confirmed: sql<number>`count(*) filter (where ${leads.emailVerifiedAt} is not null)`,
    })
    .from(leads);
  return { total: Number(row.total), confirmed: Number(row.confirmed) };
}
