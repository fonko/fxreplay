import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { createPostHogServerClient } from "../lib/posthog/server";
import { EVENTS, type AccountCreatedProps } from "../lib/posthog/events";
// import { db } from "../db/client";
// import { leads } from "../db/schema";

export const signup = defineAction({
  accept: "form",
  input: z.object({
    email: z.email(),
    name: z.string().min(1).optional(),
    variantId: z.string(),
  }),
  handler: async ({ email, name, variantId }, context) => {
    const distinctId = context.cookies.get("ph_distinct_id")?.value ?? crypto.randomUUID();
    const posthog = createPostHogServerClient();

    try {
      // TODO(db): replace with a real Drizzle insert once the Supabase
      // migration for `leads` is applied (see src/db/schema.ts). Stubbed so
      // the Action/Zod/event contract is real ahead of live DB wiring.
      const userId = crypto.randomUUID();
      void email;
      void name;

      await posthog.captureImmediate({
        distinctId,
        event: EVENTS.ACCOUNT_CREATED,
        properties: {
          user_id: userId,
          variant_id: variantId,
          conversion_time_seconds: null,
        } satisfies AccountCreatedProps,
      });

      return { success: true as const, userId };
    } catch {
      throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Signup failed" });
    } finally {
      await posthog.shutdown();
    }
  },
});
