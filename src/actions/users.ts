import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import type { ActionAPIContext } from "astro:actions";
import { createUser, updateUser, listUsers, deleteUser, getEmailConfirmationStats } from "../lib/users/service";
import { createPostHogServerClient } from "../lib/posthog/server";
import {
  getPersonTimeline,
  getPersonRecordings,
  getFunnelOverview,
  createPublicRecordingLink,
} from "../lib/posthog/query";
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
        // Two independent queries on purpose — see getPersonRecordings's
        // comment: the timeline's 200-event window can miss recordings from
        // well before it, so recordings aren't derived from `events` here.
        const [events, recordings] = await Promise.all([getPersonTimeline(id), getPersonRecordings(id)]);
        return { events, recordings };
      } catch (err) {
        console.error("users.timeline action failed:", err);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not load timeline" });
      }
    },
  }),

  // Explicit, one-recording-at-a-time action — never triggered by loading a
  // timeline. Enabling PostHog's public sharing makes that session viewable
  // by anyone with the link (no login), so it only happens when an admin
  // deliberately asks for this exact recording.
  createRecordingLink: defineAction({
    accept: "json",
    input: z.object({
      sessionId: z.string().min(1),
    }),
    handler: async ({ sessionId }, context) => {
      assertAdmin(context);
      try {
        return { url: await createPublicRecordingLink(sessionId) };
      } catch (err) {
        console.error("users.createRecordingLink action failed:", err);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not generate public link" });
      }
    },
  }),

  // North-star numbers for the admin overview: overall/per-variant CVR
  // (PostHog — the denominator, landing_page_viewed, never lives in
  // Postgres) plus email confirmation rate (Postgres-only, no external call).
  overview: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      assertAdmin(context);
      try {
        const [funnel, emailStats] = await Promise.all([getFunnelOverview(), getEmailConfirmationStats()]);
        return { funnel, emailStats };
      } catch (err) {
        console.error("users.overview action failed:", err);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Could not load overview" });
      }
    },
  }),
};
