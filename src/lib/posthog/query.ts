export interface TimelineEvent {
  event: string;
  timestamp: string;
  ctaLocation: string | null;
  errorSource: string | null;
  errorMessage: string | null;
}

export interface PersonRecording {
  sessionId: string;
  url: string;
  firstSeenAt: string;
}

export interface FunnelStepCount {
  event: string;
  variant: string | null;
  uniquePeople: number;
}

const FUNNEL_EVENTS = [
  "landing_page_viewed",
  "cta_clicked",
  "signup_form_started",
  "signup_form_submitted",
  "account_created",
] as const;

// The PostHog Query API lives on the *app* host (us.posthog.com), not the
// ingestion host used for capture (PUBLIC_POSTHOG_HOST, us.i.posthog.com) —
// a separate env var on purpose, not a derived one.
async function runHogQL<T extends unknown[]>(hogql: string, name: string): Promise<T[]> {
  const appHost = import.meta.env.POSTHOG_APP_HOST;
  const projectId = import.meta.env.POSTHOG_PROJECT_ID;
  const apiKey = import.meta.env.POSTHOG_PERSONAL_API_KEY;

  if (!appHost || !projectId || !apiKey) {
    throw new Error(
      "PostHog query API is not configured (POSTHOG_APP_HOST / POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY)",
    );
  }

  const res = await fetch(`${appHost}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql }, name }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { results?: T[] };
  return data.results ?? [];
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
// name/taxonomy in PostHog itself is unchanged. properties.source and the
// first $exception_values entry are how signup.ts's captureExceptionImmediate
// calls tag errors (source: "signup_action" | "magic_link_email" | …) —
// pulled through so a $exception row can show what actually broke.
export async function getPersonTimeline(distinctId: string): Promise<TimelineEvent[]> {
  // ORDER BY … DESC LIMIT 200, then reversed below: a person who has been
  // through a lot of (mostly dev-testing) history can easily have 200+
  // events, and an ASC-ordered LIMIT would silently cut off their most
  // recent activity — including anything from the signup that's actually
  // being looked at — instead of their oldest.
  const hogql = `
    SELECT event, timestamp, properties.cta_location, properties.source, properties.$exception_values[1]
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
    ORDER BY timestamp DESC
    LIMIT 200
  `;

  const rows = await runHogQL<[string, string, string | null, string | null, string | null]>(
    hogql,
    "admin_user_timeline",
  );
  return rows
    .map(([event, timestamp, ctaLocation, errorSource, errorMessage]) => ({
      event,
      timestamp,
      ctaLocation,
      errorSource,
      errorMessage,
    }))
    .reverse();
}

// Deliberately a separate query from getPersonTimeline rather than a column
// on it: that timeline is windowed to the 200 most recent events, and for a
// person with a lot of accumulated activity (dev testing, repeat visits)
// that window can end well after their actual recorded sessions — silently
// hiding real recordings that happened earlier. raw_session_replay_events
// (filtered to size > 0, i.e. snapshot data actually persisted, not just a
// $session_id that happened to exist) is the ground truth, checked directly
// against every distinct_id this person has ever used, independent of how
// much noisier activity sits between "now" and when they were recorded.
export async function getPersonRecordings(distinctId: string): Promise<PersonRecording[]> {
  const hogql = `
    SELECT session_id, min_first_timestamp
    FROM raw_session_replay_events
    WHERE size > 0
      AND distinct_id IN (
        SELECT DISTINCT distinct_id
        FROM events
        WHERE person_id = (
          SELECT person_id
          FROM events
          WHERE distinct_id = '${distinctId}'
            AND timestamp >= now() - INTERVAL 400 DAY
          ORDER BY timestamp ASC
          LIMIT 1
        )
        AND timestamp >= now() - INTERVAL 400 DAY
      )
    ORDER BY min_first_timestamp DESC
    LIMIT 20
  `;

  const rows = await runHogQL<[string, string]>(hogql, "admin_person_recordings");
  return rows
    .map(([sessionId, firstSeenAt]) => {
      const url = buildReplayUrl(sessionId);
      return url ? { sessionId, url, firstSeenAt } : null;
    })
    .filter((rec): rec is PersonRecording => rec !== null);
}

// PostHog session recording ids are the same UUID as $session_id, and the
// player URL includes the numeric project id in its path (confirmed against
// a real recording's own returned URL) — not just `/replay/{id}` alone.
function buildReplayUrl(sessionId: string | null): string | null {
  if (!sessionId) return null;
  const appHost = import.meta.env.POSTHOG_APP_HOST;
  const projectId = import.meta.env.POSTHOG_PROJECT_ID;
  if (!appHost || !projectId) return null;
  return `${appHost}/project/${projectId}/replay/${sessionId}`;
}

// Deliberately NOT called automatically when the timeline loads: enabling
// sharing makes that one recording viewable by anyone with the link (no
// PostHog login), so it only runs when an admin explicitly asks for a given
// session — never as a side effect of just opening someone's timeline. Needs
// a personal API key with the `sharing_configuration:write` scope (Query
// Read alone isn't enough).
export async function createPublicRecordingLink(sessionId: string): Promise<string> {
  const appHost = import.meta.env.POSTHOG_APP_HOST;
  const projectId = import.meta.env.POSTHOG_PROJECT_ID;
  const apiKey = import.meta.env.POSTHOG_PERSONAL_API_KEY;

  if (!appHost || !projectId || !apiKey) {
    throw new Error(
      "PostHog query API is not configured (POSTHOG_APP_HOST / POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY)",
    );
  }

  const res = await fetch(`${appHost}/api/projects/${projectId}/session_recordings/${sessionId}/sharing/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ enabled: true }),
  });

  if (!res.ok) {
    throw new Error(`Failed to enable public sharing: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("PostHog did not return a sharing access token");
  }

  // The one PostHog page built to be viewed unauthenticated (and iframed).
  return `${appHost}/embedded/${data.access_token}`;
}

// Unique *people* (uniq(person_id), not distinct_id — a person can carry
// several distinct_ids across the anonymous→identified merge, so counting
// distinct_id would overcount) per funnel step, broken down by variant_id
// where that property exists (landing_page_viewed, cta_clicked,
// account_created — not the two signup_form_* events). One query, so the
// admin overview computes both the overall funnel and the per-variant CVR
// from a single external round trip.
export async function getFunnelOverview(): Promise<FunnelStepCount[]> {
  const eventList = FUNNEL_EVENTS.map((e) => `'${e}'`).join(", ");
  const hogql = `
    SELECT event, properties.variant_id AS variant, uniq(person_id) AS unique_people
    FROM events
    WHERE event IN (${eventList})
      AND timestamp >= now() - INTERVAL 400 DAY
    GROUP BY event, variant
  `;

  const rows = await runHogQL<[string, string | null, number]>(hogql, "admin_funnel_overview");
  return rows.map(([event, variant, uniquePeople]) => ({ event, variant, uniquePeople }));
}
