# Project Instructions & Technical Architecture

## 1. Executive Summary & Challenge Context
- **Goal:** Build an ultra-performant, high-converting landing page ("Try FX Replay Free") optimized for marketing traffic conversion.
- **Key Focus:** Extreme performance (Core Web Vitals), 100% technical SEO, zero-flicker SSR A/B testing with PostHog, and clean event instrumentation.
- **Execution Strategy:** AI-Native Engineering using Claude Code, MCP servers, and specialized sub-agents.

---

## 2. Tech Stack Matrix & Architecture Constraints

| Stack Layer | Technology Selection | Architectural Justification & Rules |
| :--- | :--- | :--- |
| **Web Framework** | **Astro 5+ (SSR)** | Islands Architecture for zero unnecessary client JS. Use **Server Islands** for dynamic/personalized sections without blocking static CDN delivery. |
| **Interface Layer** | **Tailwind CSS v4 + shadcn/ui** | Atomic styling with zero runtime overhead. Maintain strict HTML5 accessibility and semantic structure. |
| **Backend Logic** | **Astro Actions** | End-to-end integration using Zod validation schemas. Strongly-typed server functions running directly within Astro. |
| **Database** | **Supabase (PostgreSQL 16)** | Managed Postgres with Auth, RLS, Supavisor connection pooling, and `pgvector` extension. |
| **ORM / Query Builder**| **Drizzle ORM** | SQL-first TypeScript ORM. Use **UUIDv7** for primary keys and identity columns (`generated always as identity`). Avoid heavy runtimes. |
| **Analytics & A/B** | **PostHog** | Server-side (SSR/Edge) Feature Flag evaluation via `posthog-node` to guarantee zero-flicker A/B testing. |
| **Deployment** | **Vercel / Cloudflare Workers** | Edge-distributed execution matching Astro SSR adapters. |
| **AI Orchestration** | **Claude Code + MCP + Skills** | Agentic workflows using `.claude/agents/` and `.claude/commands/`. |

---

## 3. Strict Development Rules

### Performance & Hydration
1. **Zero Client JS by Default:** Deliver static HTML/CSS. Only hydrate interactive components using explicit directives (`client:visible`, `client:idle`).
2. **Core Web Vitals Targets:**
   - **LCP:** < 2.5s (Pre-rendered HTML / Edge SSR).
   - **INP:** < 200ms (No global JS hydration).
   - **CLS:** < 0.1 (Explicit dimensions, Astro `<Image />` component mandatory).

### Database & RLS Security
1. **Row Level Security (RLS):** RLS MUST be enabled on all public-facing database tables.
2. **API Keys Isolation:** Client code must ONLY access the public `anon_key`. Never expose `service_role` keys in browser code.
3. **Primary Keys:** Use `UUIDv7` for chronological sorting and high-throughput write performance.

### A/B Testing & Analytics
1. **Server-Side Evaluation:** NEVER evaluate Above-The-Fold A/B test flags on the client side. Feature flags MUST be resolved during Astro SSR execution using `posthog-node` to avoid layout flickers.
2. **Payload Validation:** All analytics event payloads sent via Astro Actions MUST be validated using Zod.

---

## 4. Analytics Instrumentation & Funnel Taxonomy

| Analytics Event | UI Trigger | Key Tracked Properties | Funnel Stage |
| :--- | :--- | :--- | :--- |
| `landing_page_viewed` | Initial document load in browser | `referrer`, `utm_source`, `variant_id`, `device_type` | Funnel Entry |
| `cta_clicked` | Click on primary CTA "Try FX Replay Free" | `cta_location`, `button_text`, `variant_id` | Conversion Intent |
| `signup_form_started` | First focus or input interaction in form | `field_name`, `time_to_interaction` | Intermediate Step 1 |
| `signup_form_submitted` | User submits registration form | `validation_success` (boolean), `error_code` | Intermediate Step 2 |
| `account_created` | Successful API response for user creation | `user_id`, `conversion_time_seconds`, `variant_id` | **Final Conversion Metric** |

---

## 5. Workflow Commands & Agents

- Sub-agents are defined in `.claude/agents/`:
  - `@performance-agent`: Hydration, TTFB, and bundle audit.
  - `@seo-agent`: OpenGraph, JSON-LD, canonicals, and HTML5 semantics.
  - `@growth-experimentation-agent`: PostHog SSR flags and conversion tracking.
- Custom Workflow Commands:
  - Run `/growth-audit` before committing code to trigger a full automated check across all 3 sub-agents.

## Design System & Brand Kit
- Always follow the design guidelines defined in `.claude/commands/brand-kit.md`.
- Import `src/styles/tokens.css` into the global styles and use semantic variables exclusively.
- Use SVGs from `public/logos/` for all brand assets.