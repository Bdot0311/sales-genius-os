import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  checkGrounded,
  contentWords,
  figuresIn,
  keepGrounded,
} from "../../supabase/functions/_shared/grounding.ts";

/**
 * build-agent turns a sentence into an agent config. company_context and
 * value_props are then written into every email that agent ever sends — so a
 * fabrication here happens once, at setup, and contaminates output for months.
 */
const SOURCES = [
  "an agent that follows up with marketing agencies who opened but never replied",
  "Alephwave",
  JSON.stringify({ industry: "marketing agencies", job_title: "founder", country: "UK" }),
];

describe("what the model is allowed to write", () => {
  it("accepts a rephrasing of what the user said", () => {
    // Compression and tidying are the useful part; this must not be blocked.
    expect(checkGrounded("Follow-up outreach for marketing agencies.", SOURCES).grounded).toBe(true);
  });

  it("accepts wording drawn from the saved ICP", () => {
    expect(checkGrounded("Works founders at UK marketing agencies.", SOURCES).grounded).toBe(true);
  });

  it("rejects positioning the user never gave", () => {
    const check = checkGrounded(
      "The leading revenue intelligence platform trusted by enterprise procurement teams.",
      SOURCES,
    );
    expect(check.grounded).toBe(false);
    expect(check.reason).toBe("introduces_claims");
  });
});

describe("invented numbers are refused outright", () => {
  it("rejects a metric that appears nowhere in the sources", () => {
    const check = checkGrounded("Helps marketing agencies book 3x more meetings.", SOURCES);
    expect(check.grounded).toBe(false);
    expect(check.reason).toBe("introduces_figures");
    expect(check.novel).toContain("3x");
  });

  it("rejects a percentage even when the sentence otherwise matches", () => {
    // The surrounding words are all from the sources. The figure is not, and a
    // figure is what a prospect will ask about.
    expect(checkGrounded("Follow-up for marketing agencies, 40% reply rate.", SOURCES).reason)
      .toBe("introduces_figures");
  });

  it("keeps a figure the user actually supplied", () => {
    const withNumber = [...SOURCES, "we send about 200 emails a week"];
    expect(checkGrounded("Sends about 200 emails a week.", withNumber).grounded).toBe(true);
  });

  it("finds figures in every shape they arrive in", () => {
    expect(figuresIn("up 40% to 3x, worth $12,000 and 5k seats")).toEqual(
      expect.arrayContaining(["40%", "3x", "$12,000", "5k"]),
    );
  });
});

describe("the word comparison", () => {
  it("ignores filler so a rephrasing is not punished for connectives", () => {
    expect(contentWords("we help the teams that are in a hurry")).toEqual(["team", "hurry"]);
  });

  it("splits hyphens so a compound lines up with the words it came from", () => {
    // "follow-up" has to match the "follows up" the user actually wrote.
    expect(contentWords("follow-up outreach")).toEqual(["follow", "outreach"]);
  });

  it("treats an empty candidate as ungrounded rather than fine", () => {
    expect(checkGrounded("   ", SOURCES)).toMatchObject({ grounded: false, reason: "empty" });
  });
});

describe("filtering a list of value props", () => {
  it("keeps the real ones and drops the invented ones", () => {
    const { kept, dropped } = keepGrounded(
      [
        "Follow-up outreach for marketing agencies",
        "Trusted by 500 enterprise revenue teams",
        "Founder-led outreach in the UK",
      ],
      SOURCES,
    );
    expect(kept).toHaveLength(2);
    expect(dropped).toEqual(["Trusted by 500 enterprise revenue teams"]);
  });
});

describe("the builder uses it, and caps volume to the plan", () => {
  const SRC = readFileSync("supabase/functions/build-agent/index.ts", "utf8");

  it("saves company context only when it is grounded", () => {
    expect(SRC).toMatch(/company_context: companyContextCheck\.grounded \? companyContextRaw : ""/);
  });

  it("saves only grounded value props", () => {
    expect(SRC).toMatch(/value_props: groundedValueProps/);
  });

  it("grounds against what the user actually supplied", () => {
    expect(SRC).toMatch(/const groundingSources = \[/);
    expect(SRC).toMatch(/description,/);
  });

  it("caps the daily send figure to the plan, not to a constant", () => {
    // A build showing an allowance the account can never send is a promise
    // broken at send time.
    expect(SRC).toMatch(/Math\.min\(num\(parsed\.max_daily_new_emails, 20\), planDailyEmails\)/);
    expect(SRC).toMatch(/daily_email_limit/);
  });

  it("tells the user which fields it left for them", () => {
    expect(SRC).toMatch(/needs_from_you/);
  });
});
