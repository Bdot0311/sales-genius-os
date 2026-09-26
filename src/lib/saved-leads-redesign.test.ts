import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  hasActiveFilters,
} from "../hooks/use-saved-leads";

const PAGE = readFileSync("src/pages/SavedLeads.tsx", "utf8");
const SIGNALS = readFileSync("src/components/leads/LeadSignals.tsx", "utf8");
const HOOK = readFileSync("src/hooks/use-saved-leads.tsx", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260926140000_saved_leads_server_side.sql",
  "utf8",
);

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const P = code(PAGE);
const S = code(SIGNALS);
const H = code(HOOK);

/**
 * "Still looks vibe coded."
 *
 * Seven of twelve columns were pills, so the eye had to read each one to learn
 * what it was and nothing read as more important than anything else. The fix is
 * not fewer signals: all five are used, including the lead evaluation. It is
 * that a grade, a proportion, a score, an ordinal and a recommendation are five
 * different kinds of thing, and one shape threw the difference away.
 */
describe("five signals, five shapes", () => {
  it("a grade is a letterform, not a chip", () => {
    expect(S).toContain("export const TierMark");
    expect(S).toContain("font-mono text-sm tabular-nums");
  });

  it("a proportion is a bar, so it compares down the column", () => {
    expect(S).toContain("export const FitBar");
    expect(S).toMatch(/style=\{\{ width: `\$\{pct\}%` \}\}/);
  });

  it("a score is right-aligned tabular figures", () => {
    expect(S).toContain("export const IntentScore");
    expect(S).toContain("justify-end");
    expect(P).toContain('<td className="px-3 py-2 text-right">');
  });

  it("the heat word appears only when it means something", () => {
    // "Warm" on every row is a column saying the same thing to everyone,
    // which is the Enriched column's mistake in a different costume.
    expect(S).toContain("export const INTENT_HOT_THRESHOLD = 70;");
    expect(S).toContain("const hot = n >= INTENT_HOT_THRESHOLD;");
    expect(S).toMatch(/\{hot && label \?/);
  });

  it("an ordinal is a level, not a word", () => {
    expect(S).toContain("export const PriorityMark");
    expect(S).toContain("const PRIORITY_STEPS: Record<string, number> = { low: 1, medium: 2, high: 3 };");
  });

  it("a recommendation is a sentence, so it is set as one", () => {
    expect(S).toContain("export const NextStep");
    // It was filterable but never shown on the row.
    expect(P).toContain("<NextStep step={decisions[lead.id]?.fields.send_recommendation?.value} />");
  });

  it("only one colour carries meaning across all five", () => {
    // Restrained: the accent marks, everything else is neutral. Five colours
    // would rebuild the rainbow of pills this replaced.
    const hues = (S.match(/\b(?:text|bg|border)-(red|green|blue|yellow|orange|amber|emerald|cyan|pink|rose|teal|indigo)-\d{3}\b/g) ?? []);
    expect(hues).toEqual([]);
  });

  it("every signal has a state for having no value", () => {
    // Partial data is common here and an empty cell reads as a bug.
    const blanks = S.match(/&ndash;/g) ?? [];
    expect(blanks.length).toBeGreaterThanOrEqual(5);
  });
});

describe("the column that said the same thing on every row", () => {
  it("is gone, and only the exception is drawn", () => {
    expect(S).toContain("export const EnrichmentGap");
    expect(S).toContain('if (s === "enriched" || s === "completed" || s === "success") return null;');
    expect(P).not.toContain("getEnrichmentBadge");
  });

  it("took its dead icon with it", () => {
    // Removing a component leaves its imports behind, which is how a lucide
    // icon stayed imported and unused once before.
    expect(PAGE).not.toContain("AlertCircle");
    expect(PAGE).not.toContain("CheckCircle");
  });

  it("and the old badge vocabulary is not left half-replaced", () => {
    for (const dead of ["LeadTierBadge", "IntentScoreBadge", "LeadIntelligenceBadge", "getScoreBadge"]) {
      expect(PAGE, `${dead} should be gone`).not.toContain(dead);
    }
  });

  it("the card view uses the same encodings as the table", () => {
    // Two vocabularies on one page means switching views is relearning it.
    const cards = P.slice(P.indexOf('viewMode === "table" ? ('));
    expect(cards).toContain("<TierMark");
    expect(cards).toContain("<FitBar");
    expect(cards).toContain("<IntentScore");
  });
});

describe("it survives the size the account will actually reach", () => {
  it("the database filters, sorts and pages", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.search_saved_leads");
    expect(P).toContain("useSavedLeads<Lead>(filters,");
    // The loop that pulled twenty thousand rows into memory is gone.
    expect(PAGE).not.toContain('.select("*")\n          .eq("user_id", session.user.id)');
    expect(PAGE).not.toContain("page >= 19");
  });

  it("the caller never says whose rows to read", () => {
    // SECURITY DEFINER without this is a data leak.
    expect(MIGRATION).toContain("WHERE l.user_id = auth.uid()");
    expect(MIGRATION).not.toMatch(/p_user_id/);
  });

  it("the decision filters join before the limit", () => {
    // Otherwise "hot leads" means "hot leads among the first page".
    const fn = MIGRATION.slice(MIGRATION.indexOf("WITH scoped AS"));
    const join = fn.indexOf("LEFT JOIN public.lead_decisions");
    const limit = fn.indexOf("LIMIT ");
    expect(join).toBeGreaterThan(-1);
    expect(join).toBeLessThan(limit);
  });

  it("paging is stable, so no row is shown twice or skipped", () => {
    expect(MIGRATION).toContain("s.created_at DESC, s.id DESC");
  });

  it("the total is real, so the end of the list is a fact", () => {
    expect(MIGRATION).toContain("COUNT(*) OVER () AS total_count");
    expect(P).toContain("{page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, totalLeads)} of {totalLeads}");
  });

  it("the dropdowns offer the whole account, not what happened to load", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.saved_lead_facets");
    expect(P).toContain("const uniqueIndustries = facets.industries;");
  });

  it("a slow query cannot overwrite a fast one", () => {
    expect(H).toContain("const id = ++requestId.current;");
    expect(H).toContain("if (id !== requestId.current) return;");
  });

  it("export means everything matching, not the page on screen", () => {
    // The one place a silent truncation gets carried into a spreadsheet.
    expect(H).toContain("const fetchAllMatching = useCallback");
    expect(P).toContain("handleExport(await fetchAllMatching());");
  });

  it("select all names the number, because the next click might be delete", () => {
    expect(P).toContain("`Select these ${filteredAndSortedLeads.length}`");
  });
});

describe("the states that were missing", () => {
  it("no leads and no matches are different answers", () => {
    // They looked identical, which turned a filter mistake into "the product
    // lost my leads".
    expect(P).toContain("hasActiveFilters(filters) || urlFilter ? (");
    expect(PAGE).toContain("No leads match these filters.");
    expect(PAGE).toContain("No saved leads yet.");
    expect(PAGE).toContain("Clear filters");
  });

  it("loading is skeleton rows, not a spinner in the middle of content", () => {
    expect(P).toContain('aria-busy="true"');
    // Comment-stripped: the old copy survives in a comment explaining why it
    // went, and an assertion that matches its own explanation proves nothing.
    expect(P).not.toContain("Loading leads...");
  });

  it("an error says what happened and offers the one action that helps", () => {
    expect(PAGE).toContain("Could not load your leads.");
    expect(P).toContain("onClick={() => void refreshLeads()}");
  });

  it("applied filters say so and offer the way back", () => {
    expect(P).toContain("activeFilterCount(filters) + (urlFilter ? 1 : 0)");
    // JSX splits the sentence across lines, so the rendered string does not
    // exist in the source. Pin the pieces that produce it.
    expect(P).toMatch(/\} filter\s*$/m);
    expect(P).toContain('=== 1 ? "" : "s"} applied');
    expect(PAGE).toContain("Clear");
  });
});

describe("the anti-goals held", () => {
  it("row click, checkbox and inline stage editing still work", () => {
    // Agents operate in this page; these three constrain the layout rather
    // than the other way round.
    expect(P).toContain("onClick={() => handleLeadClick(lead)}");
    expect(P).toContain("onCheckedChange={() => toggleSelectLead(lead.id)}");
    expect(P).toContain("<LeadStageSelect");
    expect(P).toContain("onChange={(stage) => handleStageChange(lead.id, stage)}");
  });

  it("an inline edit does not refetch the page under the user", () => {
    expect(H).toContain("const patchRow = useCallback(");
    expect(P).toContain("patchRow(leadId, { pipeline_stage: stage } as Partial<Lead>);");
  });

  it("nothing moved behind a click", () => {
    // Collapsing the filters into a Filters button was the obvious tidy-up
    // and the stated anti-goal.
    expect(P).toContain("<Select value={filters.industry}");
    expect(P).toContain("<Select value={filters.stage}");
    expect(P).toContain("<Select value={filters.priority}");
  });
});

describe("the filter helpers decide which nothing you see", () => {
  it("untouched filters are not active", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it("a whitespace-only search is not a filter", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: "   " })).toBe(false);
  });

  it("search and dropdowns both count", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, search: "x", industry: "Software", stage: "contacted" })).toBe(3);
  });
});
