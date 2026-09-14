/**
 * The deployment environment tag applied to every PostHog capture, server and
 * browser. It defaults to "production" on the built/deployed app and
 * "development" under `astro dev` (where `import.meta.env.PROD` is false), so a
 * developer-machine event never grades as production traffic. Set
 * PUBLIC_POSTHOG_ENV to override — for example "staging" on a preview deploy.
 *
 * This module has no dependencies on purpose: the slim browser client imports
 * it, so it must not pull `posthog-node` into the client bundle.
 */
export const POSTHOG_ENVIRONMENT: string =
  import.meta.env.PUBLIC_POSTHOG_ENV ?? (import.meta.env.PROD ? "production" : "development");
