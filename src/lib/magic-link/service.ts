import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, magicLinks } from "../../db/schema";
import { getEmailTransport } from "../email/client";

const TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueMagicLink(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.insert(magicLinks).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return token;
}

export async function sendMagicLinkEmail(email: string, token: string, siteUrl: string) {
  const link = `${siteUrl}/auth/confirm?token=${token}`;
  const transport = getEmailTransport();
  await transport.sendMail({
    from: import.meta.env.EMAIL_FROM ?? import.meta.env.SMTP_USER,
    to: email,
    subject: "Confirm your FX Replay account",
    text: `Click to confirm your email and get started:\n\n${link}\n\nThis link expires in 30 minutes.`,
    html: `<p>Click below to confirm your email and get started:</p><p><a href="${link}">${link}</a></p><p>This link expires in 30 minutes.</p>`,
  });
}

export interface ConsumedMagicLink {
  userId: string;
  email: string;
  name: string | null;
}

// Single-use: the token row is marked used before it can be raced twice, and
// an already-used or expired token yields null instead of re-confirming.
export async function consumeMagicLink(token: string): Promise<ConsumedMagicLink | null> {
  const tokenHash = hashToken(token);
  const [record] = await db.select().from(magicLinks).where(eq(magicLinks.tokenHash, tokenHash)).limit(1);

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }

  await db.update(magicLinks).set({ usedAt: new Date() }).where(eq(magicLinks.id, record.id));

  const [user] = await db
    .update(leads)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(leads.id, record.userId))
    .returning();

  if (!user) return null;
  return { userId: user.id, email: user.email, name: user.name };
}
