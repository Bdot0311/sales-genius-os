import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { EMPTY_FILTERS } from "@/hooks/use-saved-leads";
import { agentProhibitions } from "../../supabase/functions/_shared/agent-prohibitions";

const MIGRATION = readFileSync("supabase/migrations/20261010190000_lead_tier_filter.sql", "utf8");
const HOOK = readFileSync("src/hooks/use-saved-leads.tsx", "utf8");
const PAGE = readFileSync("src/pages/SavedLeads.tsx", "utf8");
const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");

/**
 * The grade was computed, stored, indexed, drawn — and unselectable.
 *
 * lead-scoring.ts derives A/B/C, the column and idx_leads_tier have existed
 * since 20260726000000, score-lead-v2 writes it and every Saved Leads row
 * renders it as a pill. Nothing could filter on it, so a user could see a lead
 * was a B and had no way to say "work my B-leads" — not on the page, not
 * through the agent. B is the segment worth having: strong enough fit to be
 * worth an email, no fired signal to make anyone pick it by hand.
 */
describe("the grade can be asked for", () => {
  it("the database filters on it", () => {
    expect(MIGRATION).toContain("p_tier");
    expect(MIGRATION).toMatch(/p_tier\s+IS NULL\s+OR/);
  });

  it("an unscored lead is findable, not invisible", () => {
    // NULL = NULL matches nothing, so a plain equality filter would hide the
    // leads a user most wants to find.
    expect(MIGRATION).toContain("p_tier = 'unscored' AND l.tier IS NULL");
    expect(CHAT).toContain('if (args.tier === "unscored") b = b.is("tier", null);');
  });

  /*
   * Postgres overloads by argument list, so CREATE OR REPLACE with one extra
   * parameter adds a second function rather than replacing the first, and
   * PostgREST then fails every call as ambiguous. The live signature also
   * carries a p_show that no migration in this repo creates, so the drop
   * cannot name a literal argument list either.
   */
  it("replaces the function instead of overloading it", () => {
    expect(MIGRATION).toContain("DROP FUNCTION IF EXISTS public.search_saved_leads");
    expect(MIGRATION).toContain("pg_get_function_identity_arguments");
    const drop = MIGRATION.indexOf("DROP FUNCTION IF EXISTS");
    const create = MIGRATION.indexOf("CREATE FUNCTION public.search_saved_leads");
    expect(create).toBeGreaterThan(drop);
  });

  it("keeps p_show, which only the live database had", () => {
    // Dropping and recreating without it would take the two overview
    // click-throughs down.
    expect(MIGRATION).toContain("p_show          text    DEFAULT NULL");
    expect(MIGRATION).toContain("p_show = 'no-email'");
    expect(MIGRATION).toContain("p_show = 'never-contacted'");
  });

  it("every query the page makes carries the filter", () => {
    // The list, the out-of-range probe and the export all go through the same
    // RPC. One that drops the filter exports rows the user did not ask for.
    const calls = HOOK.split('supabase.rpc("search_saved_leads"').length - 1;
    expect(calls).toBe(3);
    expect(HOOK.split("p_tier: orNull(filters.tier)").length - 1).toBe(3);
    expect(EMPTY_FILTERS.tier).toBe("all");
  });

  it("the page offers it with the counts on it", () => {
    // "B" without "1,284" asks the user to guess whether running it is worth
    // their afternoon.
    expect(PAGE).toContain('setFilter("tier", v)');
    expect(PAGE).toContain("facets.tiers?.[value]");
    expect(MIGRATION).toContain("'tiers'");
  });

  it("the agent can filter and can see what it filtered", () => {
    expect(CHAT).toContain('enum: ["A", "B", "C", "unscored"]');
    expect(CHAT).toContain('b = b.eq("tier", args.tier)');
    // Reading the grade back matters as much as filtering by it: the agent
    // reports on the set it worked.
    expect(CHAT).toMatch(/pipeline_stage, tier, icp_score/);
  });

  it("the filter applies to the count as well as the page", () => {
    // applyFilters feeds both the page query and the full id sweep, so the
    // set the turn commits to finishing is the set it reported.
    const fn = CHAT.slice(CHAT.indexOf("const applyFilters = (base: any)"));
    expect(fn.indexOf('b.eq("tier", args.tier)')).toBeLessThan(fn.indexOf("return b;"));
  });
});

/**
 * Nothing stopped the agent inventing an offer.
 *
 * Banned phrases, one ask, length and the proof rules all constrain the FORM
 * of an email. None constrains what it promises. The agent is scored on
 * replies, so when a prospect asks about price or an integration, the move
 * that keeps the thread alive is to say yes — the same reflex as a rep saying
 * "I think that's on the roadmap".
 */
describe("what the agent cannot offer", () => {
  it("covers the commitments nobody can honour", () => {
    const b = agentProhibitions("Brandon");
    for (const s of ["discount", "roadmap", "integrat", "SLA", "contract", "guarantee"]) {
      expect(b.toLowerCase()).toContain(s.toLowerCase());
    }
  });

  it("names who to defer to", () => {
    expect(agentProhibitions("Brandon")).toContain("pass it to Brandon");
    expect(agentProhibitions(null)).toContain("the account owner");
    expect(agentProhibitions("  ")).toContain("the account owner");
  });

  it("is in the chat agent's prompt", () => {
    expect(CHAT).toContain("${agentProhibitions(profile?.full_name)}");
  });

  /*
   * This is the one that matters. agent-run answers a warm prospect
   * autonomously with nobody reading it first, and its reply prompt carried no
   * prohibitions at all — so "what does this cost?" got whatever the model
   * thought would keep the thread going.
   */
  it("is in the autonomous reply prompt, which nobody reads first", () => {
    const reply = RUN.slice(RUN.indexOf("const replySystemPrompt"), RUN.indexOf("const replyPrompt"));
    expect(reply).toContain("agentProhibitions(");
  });

  it("is in the autonomous outbound prompt too", () => {
    const outbound = RUN.slice(RUN.indexOf("const outreachSystemPrompt"));
    expect(outbound.slice(0, 600)).toContain("agentProhibitions(");
  });

  it("exists once", () => {
    // Three prompts sharing one block. Three copies would drift the way the
    // banned-phrase list drifted into five.
    const files = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", "No product promises", "--", "src", "supabase", ":(exclude)*.test.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    ).split("\n").filter(Boolean);
    expect(files).toEqual(["supabase/functions/_shared/agent-prohibitions.ts"]);
  });
});
