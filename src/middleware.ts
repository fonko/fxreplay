import { defineMiddleware } from "astro:middleware";
import { createPostHogServerClient } from "./lib/posthog/server";

const DISTINCT_ID_COOKIE = "ph_distinct_id";
const FIRST_SEEN_COOKIE = "ph_first_seen_at";
const UTM_COOKIE = "ph_utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const VISIT_COUNT_COOKIE = "ph_visit_count";
const HERO_FLAG_KEY = "hero-variant";

export const onRequest = defineMiddleware(async (context, next) => {
  let distinctId = context.cookies.get(DISTINCT_ID_COOKIE)?.value;
  if (!distinctId) {
    distinctId = crypto.randomUUID();
    context.cookies.set(DISTINCT_ID_COOKIE, distinctId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: true,
    });
  }

  // Marks funnel entry time so signup.ts can compute conversion_time_seconds
  // for the account_created event without a round trip to PostHog.
  if (!context.cookies.get(FIRST_SEEN_COOKIE)?.value) {
    context.cookies.set(FIRST_SEEN_COOKIE, Date.now().toString(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: true,
    });
  }

  // First-touch UTM attribution: only set if this browser has never had one —
  // a later visit with no query params (e.g. a direct return to sign up)
  // shouldn't overwrite the campaign that actually brought them here.
  if (!context.cookies.get(UTM_COOKIE)) {
    const utm: Record<string, string> = {};
    for (const param of UTM_PARAMS) {
      const value = context.url.searchParams.get(param);
      if (value) utm[param] = value;
    }
    if (Object.keys(utm).length > 0) {
      context.cookies.set(UTM_COOKIE, utm, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure: true,
      });
    }
  }

  // Counts real landing-page loads only (not action calls, not other
  // routes) — a cheap "how many times did this browser show up as anonymous
  // before converting" number that signup.ts snapshots onto the new row.
  if (context.request.method === "GET" && context.url.pathname === "/") {
    const current = Number(context.cookies.get(VISIT_COUNT_COOKIE)?.value ?? "0");
    context.cookies.set(VISIT_COUNT_COOKIE, String(current + 1), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: true,
    });
  }

  let heroVariant = "control";
  let posthog: ReturnType<typeof createPostHogServerClient> | undefined;
  try {
    posthog = createPostHogServerClient();
    const flags = await posthog.evaluateFlags(distinctId, { flagKeys: [HERO_FLAG_KEY] });
    const flag = flags.getFlag(HERO_FLAG_KEY);
    heroVariant = typeof flag === "string" ? flag : "control";
  } catch {
    // Fail open: never let a PostHog outage (or missing config) block the render.
    heroVariant = "control";
  } finally {
    await posthog?.shutdown();
  }

  context.locals.distinctId = distinctId;
  context.locals.heroVariant = heroVariant;
  context.locals.posthogBootstrap = {
    distinctID: distinctId,
    featureFlags: { [HERO_FLAG_KEY]: heroVariant },
  };

  return next();
});
