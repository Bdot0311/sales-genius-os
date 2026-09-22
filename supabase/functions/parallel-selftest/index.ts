// Temporary: verifies the Parallel key works. Returns counts only, no secrets.
import { leadResearchQueries, parallelConfigured, parallelSearch } from "../_shared/parallel.ts";

Deno.serve(async () => {
  const res = await parallelSearch({
    objective: "Recent dated developments at the company Stripe (website stripe.com): funding, launches, hires.",
    queries: leadResearchQueries("Stripe", "stripe.com"),
    maxResults: 5,
    excludeDomains: ["stripe.com"],
  });
  return Response.json({
    configured: parallelConfigured(),
    error: res.error,
    results: res.results.length,
    dated: res.results.filter((r) => r.publish_date).length,
    hosts: res.results.map((r) => { try { return new URL(r.url).host; } catch { return "?"; } }),
  });
});
