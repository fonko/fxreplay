# FX Replay — "Try FX Replay Free" Landing

A small, production-oriented landing experience for the FX Replay growth engineering
challenge: a marketing landing page, a real signup flow backed by a Users API, an
SSR-resolved A/B test with zero layout flicker, and an analytics funnel instrumented
from day one.

## 1. Working Implementation

- **Repo:** https://github.com/fonko/fxreplay
- **Live deployment:** https://fxreplay.alfonsopayra.me (also reachable at the Vercel-assigned
  domain, https://fxreplay-seven.vercel.app)
- **Local setup:**
  ```bash
  npm install
  cp .env.example .env   # fill in Supabase/PostHog/admin values, see comments in the file
  npm run dev            # http://localhost:4321
  ```
  Database schema changes go through Drizzle:
  ```bash
  npm run db:generate    # writes SQL under drizzle/
  npm run db:migrate     # applies it to DATABASE_URL
  ```

## 2. Architecture Overview

**Stack:** Astro 5 (SSR, `@astrojs/vercel` adapter) + Tailwind v4/shadcn/ui + Astro Actions
(Zod-validated) + Drizzle ORM + Supabase Postgres + PostHog (`posthog-js` client,
`posthog-node` server). Full rationale and hard constraints live in [CLAUDE.md](CLAUDE.md).

**Rendering:** everything is static server-rendered HTML except the signup form
(`SignupForm.tsx`, hydrated with `client:idle`) — the only client JS on the page. Hero
copy, features, social proof, and footer are plain `.astro` components with zero
hydration cost.

**A/B flag resolution:** [src/middleware.ts](src/middleware.ts) runs on every request,
assigns/reads a `ph_distinct_id` cookie, and calls `posthog-node`'s `evaluateFlags` for
the `hero-variant` flag *before* rendering. The resolved variant is passed to
[Hero.astro](src/components/sections/Hero.astro) as server data — the client never
re-decides or repaints the variant, so there's no flicker and no client-side flag
network call blocking first paint. If PostHog is unreachable, the flag evaluation
fails open to `"control"` ([middleware.ts:39](src/middleware.ts)) rather than blocking
the render.

**Users API:** implemented as Astro Actions rather than a separate REST layer, per the
stack decision in CLAUDE.md (Actions are Astro's typed, Zod-validated server-function
convention and already do a real HTTP round trip under the hood).
- [`src/lib/users/service.ts`](src/lib/users/service.ts) — the actual Drizzle
  queries (`createUser`, `updateUser`, `listUsers`), independent of the transport.
- [`src/actions/users.ts`](src/actions/users.ts) — `users.create` / `users.update` /
  `users.list`, each with its own Zod input contract.
- [`src/actions/signup.ts`](src/actions/signup.ts) — the public signup flow calls the
  *same* `createUser` function `users.create` uses, so persistence is one code path,
  not a duplicated one-off insert.
- `create` is public (it's what the signup form calls). `update`/`list` return PII
  (email, name) and there's intentionally no end-user auth system for this challenge, so
  they're gated behind a shared `ADMIN_API_KEY` header instead of being left open.

**Persistence trade-offs:**
- Table is named `leads` (pre-existing from an earlier scaffold) and serves as the
  Users API's backing store — didn't rename it, not worth the churn for a take-home.
- `DATABASE_URL` uses Supabase's **Transaction pooler** (Supavisor, port 6543), not the
  direct connection (port 5432) — the direct connection is IPv6-only and Vercel's
  functions run on IPv4, so the direct URL resolves to `ENOTFOUND` in production (hit
  this for real during the build — see §6).
- RLS is enabled on `leads` with **no policies** ([drizzle/0000_uneven_jazinda.sql](drizzle/0000_uneven_jazinda.sql)).
  The app writes via `DATABASE_URL` (a direct Postgres role that bypasses RLS by
  design), so RLS's actual job here is blocking Supabase's auto-generated PostgREST
  Data API from exposing `leads` to the public `anon` key.
- Signup is idempotent by email: resubmitting an existing email returns the existing
  row (`alreadyExisted: true`) instead of erroring or duplicating — and doesn't re-fire
  `account_created`, so retries can't inflate the conversion metric.

**Infrastructure:**
- **Hosting/Deploy:** Vercel, connected to `main` via its GitHub integration — every
  push builds and deploys automatically (no manual `vercel` CLI step in the loop).
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `astro check` +
  `astro build` on every push/PR, independent of Vercel's own build — a genuine gate,
  not just "Vercel happened not to fail."
- **DNS/CDN:** custom subdomain (`fxreplay.alfonsopayra.me`) via a CNAME at the
  registrar pointing to Vercel's edge network; Vercel's global CDN serves the static
  output and edges the SSR function.
- **Observability:** PostHog Error Tracking — server-side exceptions in the signup and
  Users API actions are reported via `captureExceptionImmediate` (see §6), not just
  logged to Vercel's function logs where nobody's watching.
- **Security:** RLS as above; admin-gated Users API mutations; `SUPABASE_SERVICE_ROLE_KEY`
  and `DATABASE_URL` are server-only env vars, never imported into client-hydrated code.

## 3. Analytics Plan

Taxonomy (also in [src/lib/posthog/events.ts](src/lib/posthog/events.ts), kept in sync
with this table):

| Event | Trigger | Key properties | Funnel stage |
|---|---|---|---|
| `landing_page_viewed` | Initial page load | `referrer`, `utm_source`, `variant_id`, `device_type` | Entry |
| `cta_clicked` | Click on the primary CTA | `cta_location`, `button_text`, `variant_id` | Intent |
| `signup_form_started` | First focus on a form field | `field_name`, `time_to_interaction` | Intermediate 1 |
| `signup_form_submitted` | Form submitted (success or failure) | `validation_success`, `error_code?` | Intermediate 2 |
| `account_created` | Successful Users API response | `user_id`, `variant_id`, `conversion_time_seconds` | **Primary conversion** |

**Primary metric — CVR:** unique users who fire `account_created` ÷ unique users who
fire `landing_page_viewed`, both windowed by `distinct_id`.

**Tooling:** PostHog end-to-end — `posthog-js` client-side, `posthog-node` server-side
for both flag evaluation and the `account_created`/exception events, so control and
variant traffic, feature flags, funnels, and error tracking all live in one project
instead of stitching together GA4 + a separate flagging tool.

**Data quality, concretely (not just "we'd validate it"):**
- **One `distinct_id` across client and server.** Middleware sets `ph_distinct_id` as a
  cookie; the client SDK is bootstrapped with that same ID
  ([Layout.astro:46-49](src/layouts/Layout.astro)) instead of generating its own —
  otherwise server-fired `account_created` and client-fired funnel events would land on
  two different identities and the funnel just wouldn't connect.
- **`variant_id` is server-decided, not client-guessed**, and threaded through every
  event via `data-cta-variant` / hidden form fields — no risk of the client
  mis-attributing an event to the wrong arm of the experiment.
- **No double-counting conversions:** a repeat signup with the same email returns
  `alreadyExisted: true` and skips `account_created` entirely (see §2).
- **`conversion_time_seconds` is real, not a placeholder:** a `ph_first_seen_at` cookie
  set on first visit ([middleware.ts](src/middleware.ts)) lets `signup.ts` compute actual
  elapsed time instead of always sending `null`.
- **Failures are distinguishable from successes in the funnel data itself**
  (`validation_success`/`error_code` on `signup_form_submitted`) *and* surfaced
  separately as exceptions in PostHog Error Tracking — verified live: a production
  misconfiguration (see §6) initially caused a string of failed `cta_clicked` →
  `signup_form_submitted` events with no matching `account_created`, and was only
  caught by reading those properties, which is exactly why the exception-tracking hook
  was added afterward.

## 4. Experiment Proposal

The A/B mechanism (SSR `hero-variant` flag) is already live — this is the first
experiment to run on it.

- **Hypothesis:** the control headline ("Try FX Replay Free") just repeats the CTA and
  doesn't say what the product actually does. A benefit-led headline that names the
  concrete action ("Trade Smarter. Backtest Instantly.") will convert better because it
  gives a visitor a reason to act, not just an instruction.
- **Control:** current default copy — "Try FX Replay Free" / "The fastest way to
  backtest and sharpen your trading strategy with realistic market replay."
- **Variant:** `hero-variant = "test"` — "Trade Smarter. Backtest Instantly." / "Replay
  any market, any timeframe, at your own pace — and turn hindsight into your edge."
  (already implemented in [Hero.astro](src/components/sections/Hero.astro), gated by the
  PostHog flag).
- **Success metric:** CVR per variant (`account_created` ÷ `landing_page_viewed`),
  computed as a PostHog experiment/funnel breakdown by `variant_id`. `cta_clicked`
  rate is tracked as a secondary/diagnostic metric to tell a "more clicks, same signups"
  story apart from a "more signups" one.
- **Decision criteria:**
  - **Launch the variant** if it reaches statistical significance (PostHog's built-in
    significance calc, ~95% confidence) with a positive CVR lift, after a pre-registered
    minimum sample size per arm (avoids peeking-driven false positives).
  - **Keep running** if the trend is directionally positive but underpowered — don't
    call it early just because the challenge timebox is short.
  - **Reject the variant** if it's flat or negative at significance, or if it lifts
    `cta_clicked` without lifting `account_created` (a sign the new copy attracts clicks
    that don't convert — a real risk worth checking for, not just theoretical).

## 5. AI-Native Workflow

- **Project-level instructions:** [CLAUDE.md](CLAUDE.md) — stack matrix, hard rules
  (zero-JS-by-default hydration, SSR-only flag evaluation, RLS, Zod on every Action),
  and the analytics taxonomy table this doc's §3 mirrors.
- **Reusable workflow:** [`/growth-audit`](.claude/commands/growth-audit.md) — a
  standing checklist command that runs the three specialized agents below against
  hydration directives, SEO/metadata, and A/B-flag/event-schema correctness, and
  [`brand-kit`](.claude/commands/brand-kit.md) for the design-token/brand rules.
- **Agents** (`.claude/agents/`): `performance-agent` (hydration/TTFB/bundle),
  `seo-agent` (metadata/semantic HTML/structured data), `growth-experimentation-agent`
  (SSR flag correctness, event schema, `distinct_id` consistency) — each with a
  narrow, single-purpose brief rather than one do-everything agent.
- **MCP:** Supabase MCP configured for schema/migration inspection (project-scoped,
  `.mcp.json`); Context7 for up-to-date library docs during implementation; Vercel MCP
  added for deployment/env-var management (requires the user's own OAuth login to
  activate — documented rather than force-completed, since that's a credential step
  only the account owner can do).
- **Human judgment — what was delegated vs. driven by hand**, concretely from this
  build (not a hypothetical):
  - *Delegated:* CRUD action boilerplate, Drizzle migration generation, the CI workflow
    file, this README's drafting.
  - *Corrected after AI output was wrong or incomplete:* the AI's first migration
    left RLS as a comment instead of an actual policy — added explicitly and verified
    with a direct query (`relrowsecurity = true`) rather than trusting the migration ran
    silently correct.
  - *Root-caused by a human reading production logs, not guessed at:* the
    `DATABASE_URL` outage (§6) was diagnosed by first noticing the swallowed error
    was invisible in Vercel's logs, fixing the logging gap, re-triggering the failure,
    and reading the actual `ENOTFOUND db.…supabase.co` stack trace — the AI's first two
    guesses (missing env vars, then a stale value) were checked against real evidence
    before landing on the actual cause.
  - *A judgment call to push back on:* the GitHub Actions "account locked" error looked
    at first like a project misconfiguration; it was verified against public GitHub
    Community discussions before concluding it was a platform-side billing bug, not
    something to keep debugging locally.

## 6. Performance Review

- **Hydration:** one hydrated island on the whole page (`SignupForm`, `client:idle`) —
  everything else ships as static HTML with zero client JS.
- **Rendering strategy:** SSR per request (not static prerender), required for the
  server-decided A/B flag and cookie-based identity; kept cheap by evaluating exactly
  one flag key per request and failing open instead of blocking on PostHog latency.
- **Assets:** no raster images in the hero/above-the-fold content (text + one CTA), so
  there's no LCP-critical image to optimize or size explicitly — the logo in the header
  is a small inline SVG.
- **Third-party scripts:** a single deferred `posthog-js` init; no other third-party
  tags.
- **SEO — structured data & sitemap:** `Organization` + `WebSite` + `SoftwareApplication`
  JSON-LD ([Layout.astro](src/layouts/Layout.astro)) alongside the existing OG/Twitter/
  canonical tags — only asserting what's actually true (a real free tier), no fabricated
  ratings/review counts. `@astrojs/sitemap` generates `sitemap-index.xml` at build time
  (linked from `robots.txt`); with a single route it's a one-URL sitemap, which is the
  honest size for a one-page site — not padded out for appearance.
- **Known gaps, honestly, not glossed over:**
  - No explicit cache-control headers beyond Vercel's defaults — fine at current scale,
    worth revisiting with real traffic.
  - No rate limiting on the public `signup` action — a real production risk (spam
    signups, cost from repeated Postgres/PostHog calls) that a 6-hour scope didn't
    leave room for; next step would be a per-IP/per-distinct_id limit at the edge.
- **A production incident this session, and what it says about readiness:** the
  Postgres connection string in Vercel pointed at Supabase's IPv6-only direct endpoint,
  which silently `ENOTFOUND`'d on every signup in production until caught. Two concrete
  fixes came out of it, both already shipped: (1) the actual exception is now logged
  server-side instead of being swallowed into a generic message, and (2) it's also
  reported to PostHog Error Tracking, so the next class of outage surfaces as an alert
  instead of a string of silently-failed `signup_form_submitted` events someone has to
  notice by eye.
