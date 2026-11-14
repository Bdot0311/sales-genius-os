# OutReign dashboard design refresh

## Design
- Adapt the uploaded Ferrow Glow reference into the real OutReign dashboard: spacious navigation, softly illuminated surfaces, glass-like controls, clear numerical hierarchy, and consistent page spacing.
- Keep OutReign’s logo, purple identity, existing labels and page copy. Preserve accessible light-purple and dark-purple themes.
- Apply the shared appearance across dashboard pages, with a more deliberate overview layout for real metrics and attention items.

## Preserve
- Keep all existing navigation, permissions, credits, filters, forms, integrations and data flows unchanged.
- Do not import the fictional banking content, fake balances, automatic transfers, demo cursor, camera views, or whole-window scaling. This remains an interactive sales platform, not a motion demo.
- Leave the public landing page and backend behavior unchanged.

## Technical details
- Add dashboard-scoped semantic surface/glow tokens and styles using the existing React, Tailwind and design components.
- Update the shared dashboard layout, page header and panels, avoiding global utility overrides.
- Add a customer-facing What’s New entry and record the styling boundary in AGENTS.md.

## Verification
- Check signed-in overview and representative dashboard pages on desktop and mobile, both themes, navigation and sidebar collapse.
- Run existing relevant regression tests and inspect preview errors before completion.
