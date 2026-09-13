Run a comprehensive Growth & Engineering audit on the codebase by executing checks across our 3 specialized sub-agents: Performance, SEO, and Growth Experimentation.

### Audit Checklist

1. **Performance Audit (@performance-agent):**
   - Check all Astro components in `src/` for unnecessary `client:*` hydration directives.
   - Verify that all images utilize Astro's `<Image />` component with explicit dimensions.
   - Check SSR data-fetching routes using Drizzle ORM to ensure zero blocking bottlenecks on TTFB.

2. **SEO & Metadata Audit (@seo-agent):**
   - Confirm proper injection of Canonical URLs, Open Graph, and Twitter metadata tags in Astro SSR layouts.
   - Validate HTML5 semantic layout (`<header>`, `<main>`, `<h1>` to `<h6>` hierarchy).
   - Ensure dynamic JSON-LD structured data is present and valid.

3. **Growth & A/B Testing Audit (@growth-experimentation-agent):**
   - Verify that PostHog Feature Flags are evaluated on the server-side (Astro SSR / Edge) to eliminate layout flicker.
   - Audit Astro Actions for strongly-typed Zod schemas on event tracking payloads.
   - Ensure `distinct_id` consistency between client and server events.

---

### Expected Output
Provide a concise markdown summary categorized by:
- **Critical Issues:** Must-fix bugs breaking SSR, SEO, or causing client flicker.
- **Performance & CRO Warnings:** Non-blocking code smells or hydration improvements.
- **Passed Checks:** Features meeting high growth-engineering standards.