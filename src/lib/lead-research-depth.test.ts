import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const RESEARCH = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

/**
 * The research read nine guessed paths and stopped.
 *
 * Two consequences. It never found a page whose URL nobody would guess — which
 * is where launch announcements live — and, worse, it almost never learned a
 * date. lead-research.ts is full of machinery for handling dated observations
 * (datingNote, isStaleObservation, freshObservationDates) and it was starved:
 * marketing copy states a date maybe one page in five, so most observations
 * carried "" and the writer was ordered not to imply recency. Accurate
 * research the copy was forbidden to use.
 */
describe("the site is asked what it has, not guessed at", () => {
  it("reads robots.txt for wherever the sitemap actually lives", () => {
    expect(RESEARCH).toContain("sitemapsFromRobots");
    expect(RESEARCH).toContain("/robots.txt");
  });

  it("falls back to the two conventional locations", () => {
    expect(RESEARCH).toContain("/sitemap.xml");
    expect(RESEARCH).toContain("/sitemap_index.xml");
  });

  it("follows a sitemap index to the sitemaps it names", () => {
    expect(RESEARCH).toContain("isSitemapIndex");
  });

  it("fetches XML through a reader that does not demand HTML", () => {
    // fetchPage refuses anything whose content-type is not HTML, which is
    // right for pages and returns null for every sitemap and robots.txt.
    expect(RESEARCH).toContain("async function fetchText");
    const block = RESEARCH.slice(RESEARCH.indexOf("async function fetchText"));
    expect(block.slice(0, 900)).toContain("application/xml");
  });

  it("caps how much of a large site it will pull", () => {
    expect(RESEARCH).toContain("MAX_SITEMAPS");
    expect(RESEARCH).toContain("MAX_SITEMAP_ENTRIES");
  });

  it("still guesses when the site publishes no sitemap", () => {
    // The floor has to survive: plenty of small company sites have no sitemap
    // at all, and those are exactly the leads that need researching.
    expect(RESEARCH).toContain("discovered.length");
    expect(RESEARCH).toContain("CANDIDATE_PATHS");
  });
});

describe("the brief can finally be dated", () => {
  it("hands the model each page's own last-changed date", () => {
    expect(RESEARCH).toContain("lastmodNote");
    expect(RESEARCH).toContain("const dateBlock");
  });

  it("puts the dates ahead of the page text, not inside it", () => {
    const idx = RESEARCH.indexOf("let siteText =");
    expect(RESEARCH.slice(idx, idx + 300)).toContain("dateBlock");
  });

  it("lets a page date stand in for a missing copy date, and only for that page", () => {
    expect(RESEARCH).toMatch(/only for a fact you read on that exact page/i);
  });

  it("still refuses to invent a date when there is none of either", () => {
    expect(RESEARCH).toMatch(/"occurred" MUST be ""/);
    expect(RESEARCH).toMatch(/never use today's date/i);
  });

  it("does not let a page date become a claim about when something happened", () => {
    expect(RESEARCH).toMatch(/bounds how recent the fact can be, it does not prove/i);
  });
});

describe("what a company is hiring for is treated as a finding", () => {
  it("is the highest-weighted page shape", () => {
    const DISC = readFileSync("supabase/functions/_shared/site-discovery.ts", "utf8");
    const weights = DISC.slice(DISC.indexOf("const PATH_WEIGHTS"), DISC.indexOf("/** Never worth a fetch"));
    const first = weights.indexOf("careers");
    const others = ["changelog", "pricing", "about"].map((w) => weights.indexOf(w));
    expect(first).toBeGreaterThan(-1);
    for (const o of others) expect(first).toBeLessThan(o);
  });

  it("the model is told to name the actual roles", () => {
    expect(RESEARCH).toMatch(/OPEN ROLES ARE THE STRONGEST MATERIAL/);
    expect(RESEARCH).toMatch(/Treat a list of open roles as an observation/i);
  });
});

/**
 * The second research pass declared an OpenAI *function* tool called
 * "google_search" with an empty parameter object and described itself as
 * web-grounded. Declaring a function does not give a model web search.
 * Either it emitted a tool call and content came back null — so the path
 * produced nothing at all, for every lead whose website could not be read —
 * or it answered from memory, and that answer was injected under the heading
 * "VERIFIED RESEARCH ... treat as the ONLY source of external facts".
 */
describe("nothing unverified is presented as verified", () => {
  it("the tool that was never wired to anything is gone", () => {
    expect(GEN).not.toContain('name: "google_search"');
  });

  it("what comes back is labelled as recall, not as research", () => {
    expect(GEN).toContain("RECALLED BY A MODEL");
    expect(GEN).toMatch(/NOT READ FROM ANY PAGE AND NOT VERIFIED/);
  });

  it("may steer an angle and may never be stated in the email", () => {
    expect(GEN).toMatch(/You may NOT state any of it in the email/);
  });

  it("an empty answer is logged rather than swallowed", () => {
    expect(GEN).toMatch(/returned a tool call and no content/);
  });

  it("the website brief is still the source that counts", () => {
    // Prospect claims are checked against the fetched brief and the lead
    // record. Recalled text is labelled separately and is not in that corpus,
    // so it cannot make an event true.
    expect(GEN).toContain("websiteResearchBlock");
    expect(GEN).toContain("unsupportedClaims(email, prospectCorpus)");
    expect(GEN).not.toContain("verifiedResearch.split");
    expect(GEN).not.toContain("isGroundedIn");
  });
});

describe("the playbooks behind a draft are visible", () => {
  it("generate-email says which shaped the email", () => {
    expect(GEN).toContain("skills_used: skillNamesUsed({");
  });

  it("computes them per request rather than from shared state", () => {
    // A module-level variable would be raced by two concurrent generations.
    expect(GEN).not.toContain("lastSkillsUsed");
  });

  it("the chat reports them to staff only", () => {
    // They were surfaced so the routing could be checked rather than believed.
    // That is an operator's need: the names are internal module names, and to
    // a customer they read as the machinery showing through.
    expect(AGENT).toContain("Playbooks applied");
    expect(AGENT).toContain("skills_used");
    expect(AGENT).toMatch(/skillsUsed\.length && showsInternals/);
    expect(AGENT).toMatch(/has_role", \{ _user_id: userId, _role: "admin" \}/);
  });

  it("still tells everyone how many drafts came out", () => {
    // The count is the part that means something to a customer, and it must
    // not be caught by the staff gate.
    const drafted = AGENT.slice(AGENT.indexOf('label: "Drafted emails"'));
    expect(drafted.slice(0, 400)).not.toContain("showsInternals");
  });
});

/**
 * Reading more pages must not cost more wall clock than the caller has.
 * generate-email gives this function sixty seconds; seven pages at a nine
 * second timeout, one after another, is over a minute on a slow host.
 */
describe("depth does not come out of the time budget", () => {
  it("reads the discovered pages together, not one after another", () => {
    const gather = readFileSync("supabase/functions/_shared/research-gather.ts", "utf8");
    expect(gather).toContain("Promise.all(input.websiteUrls.map");
    expect(RESEARCH).toContain("gatherLeadResearch");
  });

  it("reads the fallback guesses together too", () => {
    expect(RESEARCH).toContain("CANDIDATE_PATHS.slice(0, MAX_PAGES - 1)");
    expect(RESEARCH).toContain("websiteUrls: host ? [origin, ...extraUrls] : []");
  });

  it("waits less for the small static files than for a page", () => {
    expect(RESEARCH).toContain("META_TIMEOUT_MS = 4_000");
    expect(RESEARCH).toContain("FETCH_TIMEOUT_MS = 9_000");
    const fetchText = RESEARCH.slice(RESEARCH.indexOf("async function fetchText"));
    expect(fetchText.slice(0, 600)).toContain("META_TIMEOUT_MS");
  });

  it("keeps rank order, so the best page is still read first", () => {
    const block = RESEARCH.slice(RESEARCH.indexOf("const extraUrls"));
    expect(block.slice(0, 400)).toContain("discovered.slice(0, MAX_PAGES - 1)");
    expect(block).toContain("[origin, ...extraUrls]");
  });
});
