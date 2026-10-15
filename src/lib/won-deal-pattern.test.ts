import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MIN_SHARE,
  MIN_WINS,
  agreed,
  hasOpenEndedSize,
  icpPatch,
  patternQuery,
  tally,
  wonDealPattern,
  type WonDealRow,
} from "../../supabase/functions/_shared/won-deal-pattern";

/**
 * The closed-won replication play: find what the deals you won have in
 * common, then go looking for more of them.
 *
 * The temptation is to hand a model a list of company names and ask what they
 * share. That produces a confident sentence with nothing behind it. This
 * counts, reports the counts, and refuses to answer when there is not enough
 * to count.
 */

const win = (over: Partial<WonDealRow> = {}): WonDealRow => ({
  deal_id: Math.random().toString(36).slice(2),
  value: 10_000,
  industry: "Fintech",
  company_size: "51-200",
  seniority: "VP",
  job_title: "VP Sales",
  country: "United States",
  ...over,
});

const many = (n: number, over: Partial<WonDealRow> = {}) => Array.from({ length: n }, () => win(over));

describe("it will not read a pattern from a coincidence", () => {
  /*
   * Two fintech customers is not "we sell to fintech", it is two customers.
   * An ICP narrowed onto that noise sends every future search in one
   * arbitrary direction.
   */
  it("reports nothing below the floor", () => {
    const p = wonDealPattern(many(MIN_WINS - 1));
    expect(p.enough).toBe(false);
    expect(p.industries).toEqual([]);
    expect(p.seniorities).toEqual([]);
    expect(p.summary).toContain("too few");
  });

  it("says so rather than going quiet", () => {
    expect(wonDealPattern(many(2)).summary).toMatch(/2 closed-won deals/);
    expect(wonDealPattern([]).summary).toContain("No closed-won deals yet");
  });

  it("gives nothing to act on below the floor", () => {
    const p = wonDealPattern(many(3));
    expect(patternQuery(p)).toBeNull();
    expect(icpPatch(p)).toEqual({});
  });

  it("reads one at the floor", () => {
    const p = wonDealPattern(many(MIN_WINS));
    expect(p.enough).toBe(true);
    expect(p.industries[0]).toMatchObject({ value: "Fintech", count: MIN_WINS, share: 1 });
  });
});

describe("what counts as shared", () => {
  it("needs enough of the wins to agree", () => {
    // Six wins: four fintech, two logistics. Logistics is a third, under the
    // bar, so it is not part of the pattern.
    const rows = [...many(4), ...many(2, { industry: "Logistics" })];
    const p = wonDealPattern(rows);
    expect(p.industries.map((x) => x.value)).toEqual(["Fintech"]);
  });

  /*
   * Counted over the wins that HAVE the field. Letting blanks vote means a
   * dimension fails the bar for being unrecorded rather than for being
   * untrue, which is the difference between "we don't sell to one industry"
   * and "nobody filled in industry".
   */
  it("does not let blank fields vote a dimension down", () => {
    const rows = [...many(3), ...many(5, { industry: null })];
    const p = wonDealPattern(rows);
    expect(p.industries[0]).toMatchObject({ value: "Fintech", count: 3, share: 1 });
  });

  it("says plainly when the wins agree on nothing", () => {
    const rows = ["a", "b", "c", "d", "e"].map((x) =>
      win({ industry: x, company_size: x, seniority: x, job_title: x, country: x }),
    );
    const p = wonDealPattern(rows);
    expect(p.enough).toBe(true);
    expect(p.summary).toContain("agree on nothing");
  });

  it("counts a repeated value once per deal", () => {
    // A lead listing the same tool twice must not outvote one listing it once.
    const t = tally([win({ technologies: ["HubSpot", "hubspot"] }), win({ technologies: ["HubSpot"] })], (r) => r.technologies ?? null);
    expect(t[0]).toMatchObject({ value: "HubSpot", count: 2 });
  });

  it("ranks the strongest first", () => {
    const rows = [...many(5), ...many(3, { seniority: "Director" })];
    const p = wonDealPattern(rows);
    expect(p.seniorities[0].value).toBe("VP");
  });

  it("agreed() is the bar, and it is the one the module publishes", () => {
    const t = [{ value: "x", count: 4, share: MIN_SHARE }, { value: "y", count: 1, share: MIN_SHARE - 0.01 }];
    expect(agreed(t).map((x) => x.value)).toEqual(["x"]);
  });
});

describe("turning the pattern into work", () => {
  it("builds a search a sourcing tool can take", () => {
    const q = patternQuery(wonDealPattern(many(MIN_WINS)));
    expect(q).toContain("VP Sales");
    expect(q).toContain("Fintech");
    expect(q).toContain("United States");
  });

  it("stays loose enough to return results", () => {
    // Every dimension at once returns nobody. find_leads scores against the
    // ICP anyway, so the query only has to get the shape right.
    const q = patternQuery(wonDealPattern(many(MIN_WINS, { technologies: ["HubSpot", "Salesforce", "Segment"] })))!;
    expect(q).not.toContain("HubSpot");
    expect(q.split(" ").length).toBeLessThan(20);
  });

  it("writes only the dimensions the wins agreed on", () => {
    const patch = icpPatch(wonDealPattern(many(MIN_WINS, { country: null, technologies: null })));
    expect(patch.industries).toEqual(["Fintech"]);
    expect(patch.geographies).toBeUndefined();
    expect(patch.tech_stack).toBeUndefined();
  });

  /*
   * Size is a range on the ICP and a label on the lead. Narrowing to the most
   * common bucket would exclude the other wins the pattern was read from.
   */
  it("spans the company sizes rather than picking one", () => {
    const rows = [...many(5), ...many(4, { company_size: "201-500" })];
    const patch = icpPatch(wonDealPattern(rows));
    expect(patch.company_size_min).toBe(51);
    expect(patch.company_size_max).toBe(500);
  });

  /*
   * computeFit applies company_size_max as a hard ceiling (size <= max), so a
   * bucket with no top must not be written as one. "1000+" read as both ends
   * excludes a two-thousand-person company from the very group the pattern
   * was read from.
   */
  it("leaves the ceiling open when a winning bucket has no top", () => {
    const patch = icpPatch(wonDealPattern(many(MIN_WINS, { company_size: "1000+" })));
    expect(patch.company_size_min).toBe(1000);
    expect(patch.company_size_max).toBeNull();
  });

  it("clears a stale ceiling rather than leaving the old one", () => {
    // The patch updates an existing profile. Omitting the key keeps whatever
    // ceiling was there before, which is the same bug wearing the previous
    // ICP's number.
    const patch = icpPatch(wonDealPattern(many(MIN_WINS, { company_size: "5000+" })));
    expect("company_size_max" in patch).toBe(true);
    expect(patch.company_size_max).toBeNull();
  });

  it("still writes a ceiling when every bucket has one", () => {
    const patch = icpPatch(wonDealPattern(many(MIN_WINS, { company_size: "51-200" })));
    expect(patch.company_size_max).toBe(200);
  });

  it("one open bucket among closed ones opens the top", () => {
    const rows = [...many(5), ...many(4, { company_size: "1000+" })];
    const patch = icpPatch(wonDealPattern(rows));
    expect(patch.company_size_min).toBe(51);
    expect(patch.company_size_max).toBeNull();
  });

  it("reads the wordier ways of saying the same thing", () => {
    for (const label of ["1000+", "1000 or more", "over 1000", "more than 1000", "1000 and up"]) {
      expect(hasOpenEndedSize([{ value: label, count: 5, share: 1 }]), label).toBe(true);
    }
    expect(hasOpenEndedSize([{ value: "51-200", count: 5, share: 1 }])).toBe(false);
  });

  it("totals what the wins were worth", () => {
    expect(wonDealPattern(many(5, { value: 20_000 })).wonValue).toBe(100_000);
  });

  it("survives deals with no lead behind them", () => {
    const rows = many(5).map((r) => ({ ...r, industry: null, company_size: null, seniority: null, job_title: null, country: null }));
    const p = wonDealPattern(rows);
    expect(p.enough).toBe(true);
    expect(p.summary).toContain("agree on nothing");
    expect(() => icpPatch(p)).not.toThrow();
  });
});

describe("the tools are wired the way this repo requires", () => {
  const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const SCOPE = readFileSync("supabase/functions/_shared/agent-tool-scope.ts", "utf8");
  const PICKER = readFileSync("src/components/agent/AgentRoles.ts", "utf8");

  it("ships a read tool and a write tool", () => {
    for (const t of ["analyse_won_deals", "apply_won_deal_icp"]) {
      expect(CHAT, `${t} schema`).toContain(`name: "${t}"`);
      expect(SCOPE, `${t} catalog`).toContain(`${t}:`);
      expect(PICKER, `${t} picker`).toContain(t);
    }
  });

  /*
   * Reading and applying are separate calls because applying rewrites the ICP
   * every lead is scored against, and that is not something to do inside a
   * call the user asked for a read.
   */
  it("reading never writes", () => {
    const handler = CHAT.slice(CHAT.indexOf('case "analyse_won_deals"'), CHAT.indexOf('case "list_deals"'));
    const readHalf = handler.slice(0, handler.indexOf('if (!pattern.enough)'));
    expect(readHalf).not.toContain('from("icp_profiles").update');
    expect(readHalf).not.toContain('from("icp_profiles").insert');
  });

  it("refuses to write an ICP from too few wins", () => {
    const handler = CHAT.slice(CHAT.indexOf('case "analyse_won_deals"'), CHAT.indexOf('case "list_deals"'));
    expect(handler).toContain("if (!pattern.enough)");
    expect(handler).toContain("applied: false");
  });

  it("names the profile it creates, because the column demands one", () => {
    // icp_profiles.name is NOT NULL with no default, so an insert without one
    // fails for exactly the account this is most use to: wins on the board
    // and no ICP written yet.
    const handler = CHAT.slice(CHAT.indexOf('case "analyse_won_deals"'), CHAT.indexOf('case "list_deals"'));
    const insert = handler.slice(handler.indexOf('.insert({'));
    expect(insert.slice(0, 200)).toContain("name:");
  });

  it("reads the deals the renamed stage actually holds", () => {
    const handler = CHAT.slice(CHAT.indexOf('case "analyse_won_deals"'), CHAT.indexOf('case "list_deals"'));
    expect(handler).toContain('.eq("stage", "closed_won")');
  });

  it("the coach drops a settled lead before anything else", () => {
    // A lead can be marked won or lost without ever being emailed — the stage
    // control writes pipeline_stage and nothing else — so the settled test
    // has to come before the never-contacted branch or the coach recommends
    // chasing a decided deal.
    const COACH = readFileSync("supabase/functions/ai-coach/index.ts", "utf8");
    const filter = COACH.slice(COACH.indexOf("const stalledLeads"));
    const settled = filter.indexOf("l.pipeline_stage === 'won'");
    const uncontacted = filter.indexOf("if (!l.last_contacted_at)");
    expect(settled).toBeGreaterThan(-1);
    expect(settled).toBeLessThan(uncontacted);
  });

  it("tells the model not to fill the gap itself", () => {
    expect(CHAT).toContain("do not substitute your own guess about who their customers are");
  });
});
