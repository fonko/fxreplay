import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";

// Same shared secret as the `x-admin-key` header (see users.ts) — just carried
// as an httpOnly cookie after one login, so the admin UI doesn't need to resend
// the key on every request. No server-side session store: the cookie's value
// *is* ADMIN_API_KEY, which stays valid across Vercel's stateless invocations.
export const ADMIN_COOKIE = "admin_session";

export const admin = {
  login: defineAction({
    accept: "json",
    input: z.object({
      key: z.string().min(1),
    }),
    handler: async ({ key }, context) => {
      if (!import.meta.env.ADMIN_API_KEY || key !== import.meta.env.ADMIN_API_KEY) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Invalid admin key" });
      }

      const secure = new URL(context.request.url).protocol === "https:";
      context.cookies.set(ADMIN_COOKIE, key, {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 2,
      });

      return { ok: true as const };
    },
  }),

  logout: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      context.cookies.delete(ADMIN_COOKIE, { path: "/" });
      return { ok: true as const };
    },
  }),
};
