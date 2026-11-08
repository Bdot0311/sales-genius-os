import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { BEDROCK_PRO_MODEL_ID, BEDROCK_STANDARD_MODEL_ID, bedrockTierForRequest } from "../../supabase/functions/_shared/bedrock";

/**
 * Which model a call runs on was invisible at the call site.
 *
 * Bedrock serves none of the gateway model ids, so `routeFor` collapses
 * whatever a caller asks for onto two models — and the test it applies is a
 * regex over the requested id. A call site got the cheap model unless its
 * string happened to contain "pro", "sonnet", "opus" or a gpt-5 id.
 *
 * Twenty-four of twenty-eight call sites wrote "google/gemini-2.5-flash" and
 * ran on Haiku, including the one that writes the emails, the two that grade
 * them, and the agent path that drafts and replies to real prospects. Nothing
 * in any of those files said so.
 *
 * Asking for a tier by name puts the choice in the diff. These assertions are
 * about that: that the tiers map to the models they claim, and that no call
 * site goes back to naming a model nobody serves.
 */

const PROVIDER = readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8");
const BEDROCK = readFileSync("supabase/functions/_shared/bedrock.ts", "utf8");

const tier = (id: string) => bedrockTierForRequest(id);

const constant = (name: string) => {
  const m = PROVIDER.match(new RegExp(`export const ${name} = "([^"]+)"`));
  expect(m, `${name} should be exported from ai-provider`).toBeTruthy();
  return m![1];
};

describe("the named tiers map to the models they claim", () => {
  it("AI_SMART reaches the stronger Bedrock model", () => {
    expect(tier(constant("AI_SMART"))).toBe("pro");
    // And the pro model really is the stronger one.
    expect(BEDROCK_PRO_MODEL_ID).toBe("us.anthropic.claude-sonnet-4-5-20250929-v1:0");
    expect(BEDROCK).toContain("BEDROCK_PRO_MODEL_ID");
  });

  it("AI_FAST reaches the cheap one", () => {
    expect(tier(constant("AI_FAST"))).toBe("fast");
    expect(BEDROCK_STANDARD_MODEL_ID).toContain("haiku-4-5");
    expect(BEDROCK).toContain("BEDROCK_STANDARD_MODEL_ID");
  });

  it("both stay valid ids for the fallback gateway", () => {
    /*
     * When Bedrock is unconfigured the requested id is passed through to the
     * fallback gateway verbatim, so a tier constant is not free to be a label.
     * Both are real provider/model ids.
     */
    for (const name of ["AI_FAST", "AI_SMART"]) {
      expect(constant(name)).toMatch(/^[a-z0-9-]+\/[a-z0-9.\-]+$/);
    }
  });
});

describe("the calls whose output is the product ask for the strong tier", () => {
  const FUNCS = "supabase/functions";
  const body = (fn: string) => readFileSync(`${FUNCS}/${fn}/index.ts`, "utf8");

  /*
   * Drafting, the two graders, the research that feeds personalisation, and
   * the agent path that drafts and replies to real prospects. A weak grader
   * is the worse half of that list: it green-lights copy the writer should
   * not have produced.
   */
  it.each([
    "generate-email",
    "generate-sequence",
    "generate-followup-suggestion",
    "check-email-rubric",
    "check-copy-risk",
    "research-lead",
    "research-account",
    "ai-coach",
    "agent-run",
  ])("%s", (fn) => {
    /*
     * Every request in the file, not merely one.
     *
     * `generate-email` has eleven call sites, among them the retry that runs
     * when a draft fails its own quality bar. An assertion that the file
     * contains AI_SMART somewhere is satisfied while that retry quietly goes
     * back to Haiku — and a retry writing the email is writing the email.
     */
    const src = body(fn);
    const total = [...src.matchAll(/\bmodel: /g)].length;
    const smart = [...src.matchAll(/\bmodel: AI_SMART\b/g)].length;
    expect(total, `${fn} should make at least one AI request`).toBeGreaterThan(0);
    expect(smart, `${fn} has ${total - smart} request(s) not on the strong tier`)
      .toBe(total);
  });

  it("leaves the mechanical calls on the cheap tier", () => {
    // Rubric-driven scoring and structured extraction, where a stronger model
    // buys little and costs three times as much.
    for (const fn of ["score-lead-v2", "map-account-committee", "build-agent"]) {
      expect(body(fn)).toContain("model: AI_FAST");
    }
  });
});

describe("no call site names a model nobody serves", () => {
  it("every edge function asks for a tier, not a gateway id", () => {
    /*
     * The trap this closes: writing "google/gemini-2.5-flash" and getting
     * Haiku, with nothing in the file to say so. Two call sites are
     * deliberately exempt — the agent chat already names a strong id, and the
     * blog writer is not customer-facing outbound.
     */
    const exempt = new Set(["agent-chat", "agent-test", "generate-blog-post"]);
    const offenders: string[] = [];
    for (const dir of readdirSync("supabase/functions", { withFileTypes: true })) {
      if (!dir.isDirectory() || exempt.has(dir.name)) continue;
      let src: string;
      try {
        src = readFileSync(`supabase/functions/${dir.name}/index.ts`, "utf8");
      } catch {
        continue;
      }
      if (/model: "(google|openai|anthropic)\//.test(src)) offenders.push(dir.name);
    }
    expect(offenders).toEqual([]);
  });
});
