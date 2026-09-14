# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for this Astro landing-page project. Session Replay, Error Tracking, and Support are enabled, along with health, error, support, and GitHub Issues signal sources. Findings will begin appearing in the [Self-driving inbox](https://us.posthog.com/project/607803/inbox) within about 30 minutes as traffic and product data arrive.

## AI data processing

Approved by the wizard's organization-level gate.

## GitHub

The PostHog GitHub App was already connected. The available repository `fonko/fxreplay` was offered for GitHub Issues syncing; its connection was skipped, so no warehouse source was created.

## Products enabled

| Product | Result | App check |
|---|---|---|
| Session Replay | enabled | The `posthog-js` initialization does not disable session recording. |
| Error Tracking | enabled | The `posthog-js` initialization does not disable exception capture. |
| Support (Conversations) | enabled | Tickets begin arriving after an inbound email, inbox, or Slack channel is connected. |

## Signal sources

| Signal source | Action |
|---|---|
| `health_checks` / `health_issue` | enabled |
| `error_tracking` / `issue_created` | enabled |
| `error_tracking` / `issue_reopened` | enabled |
| `error_tracking` / `issue_spiking` | enabled |
| `conversations` / `ticket` | enabled |
| `github` / `issue` | enabled as a dormant responder; it remains idle until a GitHub Issues warehouse source is connected. |
| `signals_scout` / `cross_source_issue` | on by default; no opt-out row was created. |
| `session_replay` / `session_analysis_cluster` | deliberately not created; Replay Vision scanners are the supported route. |

## Connected tools

| Tool | Status |
|---|---|
| GitHub Issues | selected, but the repository connection was skipped; no warehouse source was detected and the responder is dormant. |
| Linear, Jira, Sentry, Zendesk, and other catalog tools | not used in this setup. |

## Scout troop

**Active (6):**

| Scout | Why it is active |
|---|---|
| `signals-scout-general` | Cross-product correlations and surfaces not owned by a specialist. |
| `signals-scout-product-analytics` | The tracked landing-to-signup conversion flow. |
| `signals-scout-web-analytics` | Traffic, attribution, bounce, and landing-page health. |
| `signals-scout-feature-flags` | SSR feature-flag evaluation and the `hero-variant` rollout. |
| `signals-scout-web-vitals` | The landing page's Core Web Vitals goals. |
| `signals-scout-health-checks` | Actionable PostHog setup-health issues. |

**Disabled (21):**

| Scouts | Reason |
|---|---|
| `signals-scout-ai-observability`, `signals-scout-apm`, `signals-scout-logs` | No active AI observability, APM, or PostHog Logs surface was found. |
| `signals-scout-conversations` | Support is newly enabled and has no inbound channel yet. |
| `signals-scout-csp-violations` | No PostHog CSP reporting configuration was found. |
| `signals-scout-customer-analytics` | No account/group analytics surface was found. |
| `signals-scout-data-pipelines`, `signals-scout-data-warehouse` | No data pipeline or warehouse source is connected. |
| `signals-scout-error-tracking` | Covered by the native Error Tracking signal sources. |
| `signals-scout-experiments` | No active PostHog experiment was found; a server-side feature flag alone does not justify it. |
| `signals-scout-inbox-validation`, `signals-scout-insight-alerts` | No resolved Self-driving reports or insight alerts exist yet. |
| `signals-scout-mcp-tool-calls`, `signals-scout-skills-store`, `signals-scout-tasks` | These product-development surfaces are not part of this landing page's operation. |
| `signals-scout-observability-gaps`, `signals-scout-anomaly-detection` | Kept off to keep the initial troop selective; the active conversion, web, and health scouts own the immediate monitoring surfaces. |
| `signals-scout-replay-vision` | No Replay Vision scanners exist yet; it remains off until observations accumulate. |
| `signals-scout-revenue-analytics` | No payment SDK or revenue data source was found. |
| `signals-scout-session-replay` | Covered by Replay Vision scanners once created. |
| `signals-scout-surveys` | No surveys are configured. |

Scout budget was verified at **100 runs/day**, with **0 used** and **100 remaining**. The project is enrolled in early access; the service banner says to contact `team-self-driving@posthog.com` to request more runs.

## Custom scouts

No custom scout was created. Two candidates were proposed from the explicit landing-page event taxonomy in `src/lib/posthog/events.ts` and the validated form flow in `src/components/sections/SignupForm.tsx`:

- **Conversion measurement continuity** — would detect an expected funnel stage going silent or collapsing while earlier stages remain active; this fills the gap between generic web-traffic monitoring and the built-in conversion-rate scout's steady-entrant condition.
- **Sign-up failure concentration** — would detect an unusually high share of unsuccessful form submissions or a concentration in one failure category; it partially overlaps the built-in conversion scout but directly evaluates the form result.

The proposal was cancelled, so both remain declined. Error tracking and Replay analysis were ruled out as custom-scout targets because their native source and Replay Vision routes own those surfaces. If a future custom scout is noisy, set its config's `emit` value to `false` in PostHog to leave it running in dry-run mode.

## Replay Vision scanners

No scanners were created. Session Replay is enabled, and no recordings or existing scanners were found, so the project is ready for scanners when recordings begin.

The required shared Replay Vision scanner templates (`replay-vision-scanners-core`, `replay-vision-scanner-broken-experiences`, and `replay-vision-scanner-user-frustration`) were not available in the local skill installation or the project skill store. I did not invent or alter their locked prompts. Once those templates are available, create the two monitors with `emits_signals: true`: a breakage monitor scoped to the landing-page completion flow and a disjoint user-frustration monitor scoped to rage-click sessions.

A scanner is an LLM that watches individual session recordings on a schedule and pushes qualifying defects to the inbox. It is the only part of this setup that spends Replay Vision quota; its findings arrive at half weight and require independent corroboration before becoming an inbox report.

## Files modified or created

- Created `posthog-self-driving-report.md`.
- No application source, dependency, or environment files were modified.

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so the enabled Support responder can receive tickets.
- [ ] If GitHub Issues should feed Self-driving, connect `fonko/fxreplay` as a warehouse source. The responder is already enabled and will activate when syncing begins: https://us.posthog.com/project/607803/pipeline/new/source
- [ ] Make the shared Replay Vision scanner templates available, then re-run this setup or create the two prescribed monitors in Replay Vision: https://us.posthog.com/project/607803/replay-vision
- [ ] Re-enable a disabled specialist from the inbox if its product surface becomes active.

## What happens next

The scout coordinator picks up fresh configurations within roughly 30 minutes. The six active scouts use the verified daily run budget; findings cluster into reports in the inbox, where immediately actionable findings can begin coding tasks.
