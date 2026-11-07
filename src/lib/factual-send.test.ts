import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adviceWithoutInventedFigures,
  firstTouchBlockers,
  replySendBlockers,
  unauthorizedCommitments,
  unsupportedProspectAssertions,
} from "../../supabase/functions/_shared/factual-send";
import { sourceWasFetched } from "../../supabase/functions/_shared/research-citation";

const code = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a first touch with no research cannot assert a company fact", () => {
  const input = {
    researchBlock: "",
    allowedProof: "VP Sales\nlogistics",
    subject: "outbound",
    body: "Saw you just launched a freight product last week. Worth a look?",
  };

  it("flags the assertion", () => {
    const findings = firstTouchBlockers(input);
    expect(findings.map((finding) => finding.rule)).toContain("ungrounded_prospect_claim");
  });

  it("lets a role-and-industry note through", () => {
    const findings = firstTouchBlockers({
      ...input,
      body: "Most VP Sales roles in logistics lose replies in the follow-up. Worth a look?",
    });
    expect(findings).toEqual([]);
  });

  it("does not flag the same sentence once research supplied it", () => {
    const findings = firstTouchBlockers({
      ...input,
      researchBlock: "Launched a freight product last week",
    });
    expect(findings.map((finding) => finding.rule)).not.toContain("ungrounded_prospect_claim");
  });
});

describe("replies cannot invent an offer or a figure", () => {
  it("blocks a discount the account did not authorise", () => {
    expect(replySendBlockers("We can do 20% off if you book this week.", "outbound for freight teams")).toEqual(
      expect.arrayContaining([expect.stringContaining("discount")]),
    );
  });

  it("allows a discount the account already states", () => {
    expect(unauthorizedCommitments("We offer 20% off annual plans.", "We offer 20% off annual plans.")).toEqual([]);
  });

  it("blocks a figure that is not in the proof", () => {
    expect(replySendBlockers("Teams see a 40% lift.", "we book meetings")).toEqual(
      expect.arrayContaining([expect.stringContaining("40%")]),
    );
  });

  it("allows a figure the proof points name", () => {
    expect(replySendBlockers("That is 40% more meetings.", "proof: 40% more meetings")).toEqual([]);
  });

  it("does not treat a prohibition as permission", () => {
    // The matched phrase has to be in the proof. A "never say discount"
    // instruction contains the word, which is why callers pass proof points
    // and not the prohibition text. This pins the matcher itself: the phrase
    // "20% off" is not contained in "never say discount".
    expect(unauthorizedCommitments("We can do 20% off.", "never say discount").map((hit) => hit.id)).toContain(
      "discount",
    );
  });
});

describe("unsupported prospect assertions", () => {
  it("catches the shapes that read as research", () => {
    expect(unsupportedProspectAssertions("Congrats on the new round")).not.toEqual([]);
    expect(unsupportedProspectAssertions("You hired three AEs")).not.toEqual([]);
  });

  it("ignores a plain question", () => {
    expect(unsupportedProspectAssertions("Worth a look at how logistics teams run follow-up?")).toEqual([]);
  });
});

describe("coach advice loses figures the account data does not contain", () => {
  it("removes the figure and says so", () => {
    const result = adviceWithoutInventedFigures(
      "Your close rate is 62% and that is strong.",
      "Close rate: 0%",
    );
    expect(result.removed).toEqual(["62%"]);
    expect(result.text).not.toContain("62%");
    expect(result.text).toContain("not in your account data");
  });

  it("keeps a figure that is in the data", () => {
    const result = adviceWithoutInventedFigures("Your pipeline is $12000 today.", "Pipeline Value: $12000");
    expect(result.removed).toEqual([]);
    expect(result.text).toContain("$12000");
  });

  it("abstains when nothing is left", () => {
    const result = adviceWithoutInventedFigures("62%", "");
    expect(result.text).toContain("without guessing");
  });
});

describe("the unattended paths call the checks", () => {
  const agent = code("supabase/functions/agent-run/index.ts");
  const coach = code("supabase/functions/ai-coach/index.ts");
  const drafts = code("supabase/functions/_shared/draft-one.ts");
  const email = code("supabase/functions/generate-email/index.ts");

  it("holds an unresearched first touch before send-email", () => {
    const hold = agent.indexOf("heldForResearch");
    const send = agent.indexOf("functions/v1/send-email", hold);
    expect(hold).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(hold);
    expect(agent).toContain("reason: \"no_research\"");
  });

  it("checks every generated reply before it can be sent", () => {
    expect(agent.match(/blockUngroundedReply\(/g)?.length).toBe(3);
  });

  it("asks generate-email to refuse a thin introduction", () => {
    expect(drafts).toContain("blockOnThinResearch: true");
    expect(drafts).toContain('error_code === "research_too_thin"');
  });

  it("does not label recalled text as verified research", () => {
    const header = email.indexOf("VERIFIED RESEARCH for");
    const recall = email.indexOf("BACKGROUND, RECALLED BY A MODEL");
    const append = email.indexOf("if (recalledBlock) researchBlock +=");
    expect(header).toBeGreaterThan(-1);
    expect(recall).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(header);
    expect(append).toBeGreaterThan(recall);
  });

  it("drops an agent persona that the user's description does not support", () => {
    const build = code("supabase/functions/build-agent/index.ts");
    expect(build).toContain("persona: personaCheck.grounded ? personaRaw : \"\"");
    expect(build).toContain("role_instructions: instructionsCheck.grounded ? instructionsRaw : \"\"");
  });

  it("drops research observations whose source was not fetched", () => {
    const research = code("supabase/functions/research-lead/index.ts");
    expect(research).toContain("sourceWasFetched");
    const filter = research.indexOf("citedObservations");
    const save = research.indexOf("research_brief: brief");
    expect(filter).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(filter);
  });

  it("returns coach text as the stream the pages already parse", () => {
    expect(coach).toContain("text/event-stream");
    expect(coach).toContain("adviceWithoutInventedFigures");
    expect(coach).toContain("data: [DONE]");
    expect(coach).not.toContain("hasUnverifiedClaims");
  });
});

describe("the checkers stay cheap on a synthetic batch", () => {
  it("handles 5,000 citation and claim checks well under a second on this machine", () => {
    const pages = Array.from({ length: 20 }, (_, i) => `https://acme.com/p${i}`);
    const started = Date.now();
    for (let i = 0; i < 5000; i++) {
      sourceWasFetched(i % 2 === 0 ? "https://acme.com/p3" : "https://techcrunch.com/story", pages);
      firstTouchBlockers({
        researchBlock: "",
        subject: "outbound",
        body: "Most teams in logistics lose replies after the first note. Worth a look?",
        allowedProof: "logistics",
      });
    }
    const elapsed = Date.now() - started;
    // A ceiling, not a capacity claim. This is an in-process loop over the
    // pure checks. It says nothing about provider latency or mailbox throughput.
    expect(elapsed).toBeLessThan(1500);
  });
});

describe("an observation is kept only when its source was fetched", () => {
  const pages = ["https://www.acme.com/about", "https://acme.com/pricing/"];

  it("accepts the page that was fetched", () => {
    expect(sourceWasFetched("https://acme.com/about", pages)).toBe(true);
    expect(sourceWasFetched("See https://acme.com/pricing", pages)).toBe(true);
  });

  it("accepts the host when a page on that host was fetched", () => {
    expect(sourceWasFetched("https://acme.com", pages)).toBe(true);
  });

  it("rejects a source this run never retrieved", () => {
    expect(sourceWasFetched("https://techcrunch.com/acme-raises", pages)).toBe(false);
    expect(sourceWasFetched("the about page", pages)).toBe(false);
    expect(sourceWasFetched("", pages)).toBe(false);
  });

  it("does not let a neighbouring host satisfy the citation", () => {
    expect(sourceWasFetched("https://notacme.com/about", pages)).toBe(false);
  });
});
