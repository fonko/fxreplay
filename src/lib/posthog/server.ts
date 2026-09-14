import { PostHog } from "posthog-node";
import { POSTHOG_ENVIRONMENT } from "./environment";

type CaptureMessage = Parameters<PostHog["capture"]>[0];

/**
 * A fresh client per request, not a module-level singleton: Vercel functions
 * freeze/thaw between invocations, so a long-lived client can hold a stale
 * connection. flushAt/flushInterval are tuned for "one request, one flush".
 *
 * The client is wrapped so every event it sends carries the deployment
 * environment (see tagServerEnvironment).
 */
export function createPostHogServerClient() {
  const client = new PostHog(import.meta.env.PUBLIC_POSTHOG_KEY, {
    host: import.meta.env.PUBLIC_POSTHOG_HOST,
    personalApiKey: import.meta.env.POSTHOG_PERSONAL_API_KEY,
    flushAt: 1,
    flushInterval: 0,
  });
  return tagServerEnvironment(client);
}

/**
 * Stamps `environment` onto every event the client sends, and drops exceptions
 * when the app runs under `astro dev`.
 *
 * posthog-node has no super-property or before_send hook (unlike posthog-js's
 * register), so the only single point that sees every event — account_created,
 * $exception, and the $feature_flag_called that evaluateFlags fires — is the
 * pair of capture methods the SDK funnels all events through. Stamping here
 * keeps developer-machine events filterable so they never grade as production
 * traffic. Exceptions get dropped outright in dev rather than tagged, because a
 * new error message opens its own production Error Tracking issue and inbox
 * report that a property alone would not prevent.
 */
function tagServerEnvironment(client: PostHog): PostHog {
  const capture = client.capture.bind(client);
  const captureImmediate = client.captureImmediate.bind(client);
  const withEnvironment = (props: CaptureMessage): CaptureMessage => ({
    ...props,
    properties: { ...props.properties, environment: POSTHOG_ENVIRONMENT },
  });

  client.capture = (props) => capture(withEnvironment(props));
  client.captureImmediate = (props) => {
    if (!import.meta.env.PROD && props.event === "$exception") return Promise.resolve();
    return captureImmediate(withEnvironment(props));
  };
  return client;
}
