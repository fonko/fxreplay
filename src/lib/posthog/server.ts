import { PostHog } from "posthog-node";

/**
 * A fresh client per request, not a module-level singleton: Vercel functions
 * freeze/thaw between invocations, so a long-lived client can hold a stale
 * connection. flushAt/flushInterval are tuned for "one request, one flush".
 */
export function createPostHogServerClient() {
  return new PostHog(import.meta.env.PUBLIC_POSTHOG_KEY, {
    host: import.meta.env.PUBLIC_POSTHOG_HOST,
    personalApiKey: import.meta.env.POSTHOG_PERSONAL_API_KEY,
    flushAt: 1,
    flushInterval: 0,
  });
}
