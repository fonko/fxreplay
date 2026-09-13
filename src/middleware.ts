import { defineMiddleware } from "astro:middleware";
import { createPostHogServerClient } from "./lib/posthog/server";

const DISTINCT_ID_COOKIE = "ph_distinct_id";
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
