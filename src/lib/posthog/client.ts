// The default posthog-js entry bundles Session Replay, Surveys, and
// Conversations — none of which this landing page uses (Session Replay is
// only relevant post-signup; Surveys/Conversations are off for this
// project). The "slim" build is ~52% smaller and keeps everything we
// actually call: init/capture and bootstrapped feature flags.
import posthog from "posthog-js/dist/module.slim";
import { EVENTS, type LandingPageViewedProps } from "./events";

export interface PostHogBootstrap {
  distinctID: string;
  featureFlags: Record<string, string | boolean>;
}

declare global {
  interface Window {
    __ph?: typeof posthog;
  }
}

function getDeviceType(): LandingPageViewedProps["device_type"] {
  const width = window.innerWidth;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Initializes posthog-js with the SSR-resolved flags handed in via
 * `bootstrap` so the client SDK never re-fetches/re-decides feature flags —
 * it renders exactly what the server already decided. Also fires the
 * funnel-entry event once, on load.
 */
export function initPostHogClient(bootstrap: PostHogBootstrap) {
  posthog.init(import.meta.env.PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.PUBLIC_POSTHOG_HOST,
    bootstrap,
  });
  window.__ph = posthog;

  const heroVariant = bootstrap.featureFlags["hero-variant"];
  const params = new URLSearchParams(window.location.search);
  const deviceType = getDeviceType();

  posthog.capture(
    EVENTS.LANDING_PAGE_VIEWED,
    {
      referrer: document.referrer,
      utm_source: params.get("utm_source"),
      variant_id: typeof heroVariant === "string" ? heroVariant : "control",
      device_type: deviceType,
    } satisfies LandingPageViewedProps,
    // $set makes device_type a PERSON property, not just an event property on
    // this one capture — so breakdowns by device work across the whole funnel,
    // including account_created, which fires server-side via posthog-node and
    // never sees the browser's window.innerWidth.
    { $set: { device_type: deviceType } },
  );
}

/** Delegated click tracking for any element carrying data-cta-location/data-cta-text. */
export function attachCtaTracking() {
  document.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>(
      "[data-cta-location]",
    );
    if (!target) return;

    window.__ph?.capture(EVENTS.CTA_CLICKED, {
      cta_location: target.dataset.ctaLocation,
      button_text: target.dataset.ctaText ?? target.textContent?.trim(),
      variant_id: target.dataset.ctaVariant ?? "control",
    });
  });
}
