/**
 * What to call the thing that enriched a lead.
 *
 * The lead sheet masked provider names with an allow-list —
 * ['prospeo', 'peopledatalabs', 'Lusha', ...] became "OutReign" and anything
 * else rendered raw. So enrich-lead writing 'railway' showed a user
 * "Source: railway", and detect-tech-signals writing 'bloomberry' would have
 * done the same. A list of names to hide is the wrong shape: it leaks by
 * default, and it leaks precisely when someone adds a provider and does not
 * think about this file.
 *
 * Inverted here. enrichment_history.source is written only by our own edge
 * functions and always names infrastructure or a data vendor — never something
 * the user chose or would recognise — so everything is OutReign unless it is
 * explicitly an origin the user created themselves.
 *
 * The raw value stays in the database. It is genuinely useful for working out
 * which provider answered; it is just not the user's business, so it is masked
 * at the point of render rather than at the point of write.
 *
 * Note this is deliberately NOT applied to leads.source, which the user types
 * in Add Lead or that import sets to "CSV". Those are their own words and
 * masking them would be wrong.
 */

/** Origins the user created, which are theirs to see. Everything else is ours. */
const USER_ORIGINS = new Set(["csv", "csv import", "csv_import", "import", "manual", "user"]);

export const PLATFORM_SOURCE_LABEL = "OutReign";

export function displayEnrichmentSource(source: string | null | undefined): string {
  const raw = String(source ?? "").trim();
  if (!raw) return PLATFORM_SOURCE_LABEL;
  if (USER_ORIGINS.has(raw.toLowerCase())) return raw;
  return PLATFORM_SOURCE_LABEL;
}
