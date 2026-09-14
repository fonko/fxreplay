import { desc, eq } from "drizzle-orm";
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
