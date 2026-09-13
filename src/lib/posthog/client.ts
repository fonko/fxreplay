import posthog from "posthog-js";
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

  posthog.capture(EVENTS.LANDING_PAGE_VIEWED, {
    referrer: document.referrer,
    utm_source: params.get("utm_source"),
    variant_id: typeof heroVariant === "string" ? heroVariant : "control",
    device_type: getDeviceType(),
  } satisfies LandingPageViewedProps);
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
