import { describe, expect, it } from "vitest";
import { bodyViolations, readableSentence } from "../../supabase/functions/_shared/evidence-contract";
import { usableFallbackFact, voiceSafeObservation } from "../../supabase/functions/_shared/first-touch-fallback";
import { outboundGateFindings } from "../../supabase/functions/_shared/quality-gate";
import type { ApprovedFact, SnapshotRole } from "../../supabase/functions/_shared/evidence-contract";

/**
 * Research sentences that reached a real prospect, and ones that must keep
 * working, run through the gates that actually ship.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * The scenario evals in src/test/agent-evals.live.test.ts judge which tools
 * the agent calls. They need a deployed agent, an account and a JWT, so they
 * run when somebody sets that up and not before.
 *
 * Neither email that went out was a tool-selection failure. The agent picked
 * draft_outreach correctly both times. What was wrong was the sentence it
 * quoted, and that is decidable with no account, no model and no network: the
 * gates are pure functions over a fact and a sender description.
 *
 * So this runs on every pull request, for free, and it is the file to grow.
 * When a draft reads wrong, paste its research sentence in as a `refuse` case
 * with the reason. It is guarded from then on, and the fix has a failing test
 * before it has code.
 *
 * `quote` cases are the other half and matter as much: a gate that refuses
 * everything passes every `refuse` case and ships nothing. These are the
 * shapes a first touch is actually built from, and they must survive the
 * whole path -- approved, quotable, attributed, and releasable.
 */

interface Case {
  /** Where it came from, so a failure says which real email this was. */
  id: string;
  span: string;
  role: SnapshotRole;
  /** Every approved fact carries one; specificsGrounded requires it. */
  sourceUrl: string;
  why: string;
}

const REFUSE: Case[] = [
  {
    id: "lucidaclub-article",
    span: "In this article, we sit down with Jack Roosevelt, co-founder of LucidaClub, to hear his thoughts on the cannabis retail experience and how he hopes to disrupt the market by guiding new consumers to make the right purchase.",
    role: "external",
    sourceUrl: "https://example.com/lucidaclub-interview",
    why: "A magazine's editorial voice, mailed to the person it is about.",
  },
  {
    id: "proxywise-own-post",
    span: "But not to ring the opening bell for Proxywise AI 's IPO :) In fact I was invited to speak on the \"AI in Proxy Voting\" panel at the Vanguard / NYSE / NYU conference.",
    role: "external",
    sourceUrl: "https://example.com/proxywise-post",
    why: "The prospect's own post: the sender announces an invitation that was not his, and it opens mid-thought.",
  },
  {
    id: "first-person-singular",
    span: "I was invited to speak on the opening panel at the conference in Amsterdam this October.",
    role: "external",
    sourceUrl: "https://example.com/post",
    why: "Quoted bare, the sender claims somebody else's invitation.",
  },
  {
    id: "first-person-on-their-own-site",
    span: "I started this company after watching my own team lose a quarter to manual renewals.",
    role: "prospect_page",
    sourceUrl: "https://example.com/about",
    why: "A founder's I is not the sender's I, even on the company's own site.",
  },
  {
    id: "publication-meta",
    span: "In this interview the founder explains how the product came about and where it goes next.",
    role: "external",
    sourceUrl: "https://example.com/interview",
    why: "A publication describing its own piece, not a fact about the company.",
  },
  {
    id: "fragment-opener",
    span: "But the company has since moved its headquarters to Denver and doubled the support team.",
    role: "external",
    sourceUrl: "https://example.com/news",
    why: "Answers a sentence that stayed behind on the page.",
  },
  {
    id: "x-timeline-chrome",
    span: "4 6 2.5K Cosmic Labs @CosmicLabsTech Nov 29, 2025 PSA!",
    role: "external",
    sourceUrl: "https://x.com/CosmicLabsTech/status/1",
    why: "A timeline read left to right: reply, repost and like counts, the handle, the date, then the first two words of the post. It reached a prospect as the quoted fact.",
  },
  {
    id: "lead-database-table",
    span: "Departments Number of employees HR 1 See all employees Funding Data Cosmic Labs has never raised funding before.",
    role: "external",
    sourceUrl: "https://prospeo.io/company/cosmic-labs",
    why: "A lead-database profile of the prospect, read left to right across its table: field labels, a cell value, then the first real clause. It reached Kislay at Cosmic Labs as the quoted fact.",
  },
  {
    id: "directory-field-labels",
    span: "Company size 11-50 employees Headquarters location Austin Texas View profile Similar companies in developer tools.",
    role: "external",
    sourceUrl: "https://example-directory.com/acme",
    why: "The same shape from a directory that is not on any blocklist: several field labels in a row with no sentence between them.",
  },
  {
    id: "two-field-labels-only",
    span: "Company size 51-200 employees Revenue range 10M to 50M in the enterprise segment.",
    role: "external",
    sourceUrl: "https://example-directory.com/acme-small",
    why: "Exactly two field labels and nothing else wrong with it, so this is what pins the threshold at two rather than three or four.",
  },
  {
    id: "handle-in-the-sentence",
    span: "Cosmic Labs @CosmicLabsTech is building developer tooling for engineering teams.",
    role: "external",
    sourceUrl: "https://x.com/CosmicLabsTech",
    why: "A handle is chrome even when the rest of the line reads like prose.",
  },
  {
    id: "engagement-counts",
    span: "12 48 1.2K Replies Reposts Likes on the announcement thread this week.",
    role: "external",
    sourceUrl: "https://x.com/CosmicLabsTech/status/2",
    why: "Counts scraped as a sentence, with the labels that follow them.",
  },
  {
    id: "outside-plural-voice",
    span: "We caught up with the team to hear what they are building for enterprise customers.",
    role: "external",
    sourceUrl: "https://example.com/feature",
    why: "The publication's we, with no attribution to say so.",
  },
];

const QUOTE: Case[] = [
  {
    id: "site-third-person",
    span: "LucidaClub helps new cannabis consumers find products suited to how they actually want to feel.",
    role: "prospect_page",
    sourceUrl: "https://lucidaclub.example.com/",
    why: "A company describing itself in the third person on its own site.",
  },
  {
    id: "site-own-voice",
    span: "We help new cannabis consumers find products suited to how they actually want to feel.",
    role: "prospect_page",
    sourceUrl: "https://lucidaclub.example.com/",
    why: "The subject speaking about itself, which the site attribution covers.",
  },
  {
    id: "external-funding",
    span: "Proxywise AI raised a Series A to automate proxy voting research for institutional investors.",
    role: "external",
    sourceUrl: "https://www.techcrunch.com/proxywise",
    why: "The ordinary outside finding a first touch is built on.",
  },
  {
    id: "one-field-label-in-prose",
    span: "The key people behind Proxywise AI previously built compliance tooling for asset managers.",
    role: "external",
    sourceUrl: "https://www.techcrunch.com/proxywise-team",
    why: "An ordinary sentence that happens to contain one directory field label. One is prose; it takes two to be a scraped table, which is why the rule counts rather than matches.",
  },
  {
    id: "external-award",
    span: "The company was named to the Fintech 50 list for its proxy voting automation this year.",
    role: "external",
    sourceUrl: "https://www.forbes.com/fintech50",
    why: "A third-person outside fact with no voice problem.",
  },
  {
    id: "site-product",
    span: "Vendr helps SaaS companies buy software with negotiated pricing and a single renewal calendar.",
    role: "prospect_page",
    sourceUrl: "https://vendr.example.com/",
    why: "A plain product sentence from the homepage.",
  },
];

const SENDER =
  "OutReign finds decision makers, verifies their email, researches each company and writes cold outreach " +
  "that cites a real fact from their site. Built for founders and small sales teams who send outbound themselves.";

const factOf = (c: Case): ApprovedFact => ({
  id: c.id,
  snapshotId: `snap-${c.id}`,
  span: c.span,
  sourceUrl: c.sourceUrl,
  retrievedAt: new Date().toISOString(),
  publishedAt: null,
  role: c.role,
  provider: c.role === "prospect_page" ? "firecrawl" : "parallel",
} as ApprovedFact);

describe("research sentences that must never be quoted", () => {
  for (const c of REFUSE) {
    it(`${c.id}: ${c.why}`, () => {
      // Refused at approval, so it never enters the pool for any consumer.
      expect(readableSentence(c.span, c.role), "approval").toBe(false);
      // And refused by the quote-only path, which has no attribution to lean on.
      expect(usableFallbackFact(c.span), "fallback").toBe(false);
    });
  }
});

describe("research sentences a first touch is actually built from", () => {
  for (const c of QUOTE) {
    it(`${c.id}: ${c.why}`, () => {
      expect(readableSentence(c.span, c.role), "approval").toBe(true);
      expect(usableFallbackFact(c.span), "fallback").toBe(true);

      const company = c.role === "prospect_page" && c.span.startsWith("We ") ? "LucidaClub" : c.span.split(" ")[0];
      const fact = factOf(c);
      const line = voiceSafeObservation(fact, company);

      // Attributed one way or the other: never the sender's own words.
      expect(line, "attribution").toMatch(/^(?:Saw this on |Saw this in )/);
      expect(line, "quotes the sentence").toContain(c.span.replace(/\s+/g, " "));

      const subject = c.span.split(/\s+/).slice(0, 6).join(" ").replace(/[.?!,;:]+$/, "");
      const body = `Hi Sam,\n\n${line}\n\nHow are you finding decision makers worth reaching out to?\n\nBrandon`;

      // The quote still counts as the one sourced observation, and the draft
      // still clears the quality gate. A gate that refused these would pass
      // every case above and ship nothing at all.
      expect(
        bodyViolations(
          body,
          { status: "ready", reason: "", evidenceId: "e", facts: [fact], conflicts: [] } as never,
          "Brandon", subject, company, "first_touch", SENDER,
        ),
        "claims",
      ).toEqual([]);
      expect(outboundGateFindings(subject, body, c.span, 0).map((f) => f.rule), "quality").toEqual([]);
    });
  }
});

/**
 * A real pitch is still a pitch.
 *
 * Blanking the attributed quote before looking for one must not blank the
 * sender's own sales line, or the rule that caught "We help companies like
 * yours build the lead sourcing and campaign infrastructure" stops catching
 * it. The quote is exempt because it is the prospect's sentence, matched word
 * for word against an approved fact; a sentence the sender wrote is not.
 */
describe("the pitch rule still catches the sender pitching", () => {
  const FACT = "Proxywise AI raised a Series A to automate proxy voting research for institutional investors.";
  const quoted = `Saw this on techcrunch.com: "${FACT}"`;

  it("flags a pitch sitting next to an attributed quote", () => {
    const body = `Hi Sam,\n\n${quoted}\n\nWe help companies like yours build the lead sourcing and campaign infrastructure.\n\nWorth a look?\n\nBrandon`;
    expect(outboundGateFindings("Proxywise AI raised a Series", body, FACT, 0).map((f) => f.rule))
      .toContain("touch_one_pitch");
  });

  it("flags a pitch that imitates the attribution without quoting a fact", () => {
    // Not an attributed quote: no quotation marks, nothing it could match.
    const body = `Hi Sam,\n\n${quoted}\n\nSaw this on our roadmap: we help teams build outbound infrastructure.\n\nWorth a look?\n\nBrandon`;
    expect(outboundGateFindings("Proxywise AI raised a Series", body, FACT, 0).map((f) => f.rule))
      .toContain("touch_one_pitch");
  });
});

/**
 * Numbers are not the problem; counts pretending to be prose are.
 *
 * The rule that refuses "4 6 2.5K ..." has to leave a funding figure alone,
 * because a round, a headcount and a year are the most quotable facts research
 * finds. So it fires only on a SECOND numeric token before the first word,
 * which is what an engagement count looks like and what a sentence never does.
 */
describe("a number at the front is ordinary prose", () => {
  for (const [name, span] of [
    ["a round", "Cosmic Labs raised a $2.5M seed round led by Index Ventures last month."],
    ["a round, stated first", "$2.5M in seed funding went to Cosmic Labs to expand the platform team."],
    ["a percentage", "40% of their customers renew within the first quarter, according to the case study."],
    ["a year", "2026 was the year Cosmic Labs opened its second office in Berlin."],
    ["a headcount", "120 engineers now work on the platform across three offices in Europe."],
  ] as const) {
    it(`keeps ${name}`, () => {
      expect(readableSentence(span, "external"), span).toBe(true);
      expect(usableFallbackFact(span), span).toBe(true);
    });
  }
});
