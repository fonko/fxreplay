export interface TimelineEvent {
  event: string;
  timestamp: string;
  ctaLocation: string | null;
}

// The PostHog Query API lives on the *app* host (us.posthog.com), not the
// ingestion host used for capture (PUBLIC_POSTHOG_HOST, us.i.posthog.com) —
// a separate env var on purpose, not a derived one.
export async function getPersonTimeline(distinctId: string): Promise<TimelineEvent[]> {
  const appHost = import.meta.env.POSTHOG_APP_HOST;
  const projectId = import.meta.env.POSTHOG_PROJECT_ID;
  const apiKey = import.meta.env.POSTHOG_PERSONAL_API_KEY;

  if (!appHost || !projectId || !apiKey) {
    throw new Error(
      "PostHog query API is not configured (POSTHOG_APP_HOST / POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY)",
    );
  }

  // distinctId is validated as a UUID by the calling action before this runs
  // (it's leads.id, the distinct_id our SignupForm passes to identify()) —
  // never raw user input, so inlining it into the HogQL string is safe here.
  //
  // Looks up this person's internal person_id from any one event tagged with
  // their (post-identify) distinct_id, then pulls every event under that
  // person_id — which includes everything captured while they were still
  // anonymous, merged in by PostHog's identify() call.
  // properties.cta_location lets the admin UI relabel a navbar cta_clicked
  // as "nav_cta_clicked" for display — cosmetic only, the captured event
  // name/taxonomy in PostHog itself is unchanged.
  const hogql = `
    SELECT event, timestamp, properties.cta_location
    FROM events
    WHERE timestamp >= now() - INTERVAL 400 DAY
      AND person_id = (
        SELECT person_id
        FROM events
        WHERE distinct_id = '${distinctId}'
          AND timestamp >= now() - INTERVAL 400 DAY
        ORDER BY timestamp ASC
        LIMIT 1
      )
    ORDER BY timestamp ASC
    LIMIT 200
  `;

  const res = await fetch(`${appHost}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query: hogql },
      name: "admin_user_timeline",
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { results?: [string, string, string | null][] };
  return (data.results ?? []).map(([event, timestamp, ctaLocation]) => ({
    event,
    timestamp,
    ctaLocation,
  }));
}
