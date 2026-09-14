import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import type { ActionAPIContext } from "astro:actions";
import { createUser, updateUser, listUsers, deleteUser } from "../lib/users/service";
import { createPostHogServerClient } from "../lib/posthog/server";
import { getPersonTimeline } from "../lib/posthog/query";
import { ADMIN_COOKIE } from "./admin";

// No end-user auth system exists for this challenge (see CLAUDE.md scope).
// `update`/`list` return account records, so they're gated behind a shared
// admin key — either the `x-admin-key` header directly (curl/API callers) or
// the `admin_session` cookie set by `admin.login` (the browser admin panel).
function assertAdmin(context: ActionAPIContext) {
  const key = context.request.headers.get("x-admin-key") ?? context.cookies.get(ADMIN_COOKIE)?.value;
  if (!import.meta.env.ADMIN_API_KEY || key !== import.meta.env.ADMIN_API_KEY) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "Missing or invalid admin key" });
  }
}

export const users = {
  create: defineAction({
    accept: "json",
    input: z.object({
      email: z.email(),
      name: z.string().min(1).optional(),
      variantId: z.string(),
    }),
    handler: async (input, context) => {
      const distinctId = context.cookies.get("ph_distinct_id")?.value ?? crypto.randomUUID();
      const posthog = createPostHogServerClient();
      try {
        return await createUser(input);
      } catch (err) {
        console.error("users.create action failed:", err);
        await posthog.captureExceptionImmediate(err, distinctId, { source: "users_create_action" });
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create user" });
      } finally {
        await posthog.shutdown();
      }
    },
  }),

  update: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      name: z.string().min(1).optional(),
    }),
    handler: async ({ id, ...patch }, context) => {
      assertAdmin(context);
      const user = await updateUser(id, patch);
      if (!user) {
        throw new ActionError({ code: "NOT_FOUND", message: "User not found" });
      }
      return { user };
    },
  }),

  list: defineAction({
    accept: "json",
    input: z.object({
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async ({ limit }, context) => {
      assertAdmin(context);
      return { users: await listUsers({ limit }) };
    },
  }),

  delete: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
    }),
    handler: async ({ id }, context) => {
      assertAdmin(context);
      const user = await deleteUser(id);
      if (!user) {
        throw new ActionError({ code: "NOT_FOUND", message: "User not found" });
      }
      return { deleted: true as const };
    },
  }),

  // Live PostHog lookup — the full event-by-event journey (including
  // everything that happened while this person was still anonymous, merged
  // in by identify()) only lives there, not in our own Postgres row.
  timeline: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
    }),
    handler: async ({ id }, context) => {
      assertAdmin(context);
      try {
        return { events: await getPersonTimeline(id) };
      } catch (err) {
        console.error("users.timeline action failed:", err);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not load timeline" });
      }
    },
  }),
};
