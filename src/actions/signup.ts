import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { createPostHogServerClient } from "../lib/posthog/server";
import { EVENTS, type AccountCreatedProps } from "../lib/posthog/events";
import { createUser } from "../lib/users/service";
import { issueMagicLink, sendMagicLinkEmail } from "../lib/magic-link/service";

export const signup = defineAction({
  accept: "form",
  input: z.object({
    email: z.email(),
    name: z.string().min(1).optional(),
    variantId: z.string(),
  }),
  handler: async ({ email, name, variantId }, context) => {
    const distinctId = context.cookies.get("ph_distinct_id")?.value ?? crypto.randomUUID();
    const firstSeenAt = context.cookies.get("ph_first_seen_at")?.value;
    const posthog = createPostHogServerClient();

    try {
      // The signup flow's persistence goes through the same Users API used
      // by src/actions/users.ts#create — not a one-off insert — so this is a
      // real integration point rather than an isolated demo.
      const { user, alreadyExisted } = await createUser({ email, name, variantId });

      // Don't double-count conversions for an email that already signed up
      // (e.g. a re-submit after a network hiccup) — the funnel's account_created
      // event should reflect unique conversions, per the CVR definition.
      if (!alreadyExisted) {
        await posthog.captureImmediate({
          distinctId,
          event: EVENTS.ACCOUNT_CREATED,
          properties: {
            user_id: user.id,
            variant_id: variantId,
            conversion_time_seconds: firstSeenAt
              ? (Date.now() - Number(firstSeenAt)) / 1000
              : null,
          } satisfies AccountCreatedProps,
        });
      }

      // Best-effort: the account already exists at this point, so a flaky
      // SMTP send shouldn't turn into a failed signup. Sent on repeat
      // submissions too — doubles as a "resend the link" path.
      try {
        const token = await issueMagicLink(user.id);
        const siteUrl = new URL(context.request.url).origin;
        await sendMagicLinkEmail(user.email, token, siteUrl);
      } catch (err) {
        console.error("magic link email failed:", err);
        await posthog.captureExceptionImmediate(err, distinctId, { source: "magic_link_email" });
      }

      return { success: true as const, userId: user.id, alreadyExisted };
    } catch (err) {
      // Logged server-side (Vercel function logs) and reported to PostHog's
      // Error Tracking so a production outage shows up as an alertable
      // exception, not just an error_code buried in an event property.
      console.error("signup action failed:", err);
      await posthog.captureExceptionImmediate(err, distinctId, { source: "signup_action" });
      throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Signup failed" });
    } finally {
      await posthog.shutdown();
    }
  },
});
