# Outbound personalization

- Studio bulk sends and sequence dispatch use `personalized-outreach.ts` with one `generate-email` invocation per recipient/touch; shared cadence never authorizes copying another recipient’s body. Why: each outgoing message needs its recipient’s evidence and quality approval.
- Studio and sequence pickers use `src/lib/outreach-lead-pages.ts` with ordered database pages. Why: selecting All must not silently omit recipients beyond the server page size.
