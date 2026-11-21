import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeConsent } from "../hooks/use-outcome-consent";

/** Comments stripped, so an assertion cannot pass by matching its own explanation. */
const code = (path: string) => readFileSync(path, "utf8").split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

/**
 * Phase 5: the consent the drafted wording promises.
 *
 * The promise with teeth is "you can change your mind at any time, and we will
 * stop using your data from that point". The database tests prove the gate
 * enforces it. These cover the parts a person sees and the parts that decide
 * who may answer.
 */
describe("what a person is told about their own setting", () => {
  it("never reports an unanswered question as a no", () => {
    // A switch has two positions and the setting has three. If "not asked"
    // printed as "Off", the product would be claiming the account declined
    // something it was never asked.
    expect(describeConsent(undefined)).toBe("Not set");
    expect(describeConsent({ consent: null, decidedAt: null })).toBe("Not set");
  });

  it("says when the answer was given, because withdrawal has a date", () => {
    const on = describeConsent({ consent: true, decidedAt: "2026-03-03T10:00:00.000Z" });
    expect(on).toMatch(/^On since /);
    expect(on).toMatch(/2026/);
    expect(describeConsent({ consent: false, decidedAt: "2026-04-12T10:00:00.000Z" })).toMatch(/^Off since /);
  });

  it("still names the state when no date was stored", () => {
    expect(describeConsent({ consent: true, decidedAt: null })).toBe("On");
    expect(describeConsent({ consent: false, decidedAt: null })).toBe("Off");
  });
});

describe("who may answer", () => {
  const fn = code("supabase/functions/outcome-consent/index.ts");

  it("refuses an API key, because a key is a program and not the person", () => {
    expect(fn).toMatch(/X-API-Key/);
    expect(fn).toMatch(/Consent can only be given by the account owner/);
    // It must not fall back to the shared app-user resolver, which accepts keys.
    expect(fn).not.toMatch(/resolveAppUser/);
  });

  it("takes the identity from the verified token, never from the request body", () => {
    expect(fn).toMatch(/auth\.getUser\(/);
    expect(fn).toMatch(/p_user_id: user\.id/);
    expect(fn).not.toMatch(/p_user_id:\s*(?:body|requestData|input)/);
  });

  it("writes only an explicit yes or no", () => {
    // NULL is "not asked". If the function could write it, an account could be
    // moved back to a state it was never in, and the prompt would reappear
    // after the person had already answered.
    expect(fn).toMatch(/typeof raw !== "boolean"/);
  });

  it("records the answer through the function that also writes the history", () => {
    expect(fn).toMatch(/rpc\("set_outcome_consent"/);
    // Not a direct column write: the flag and the record have to move together.
    expect(fn).not.toMatch(/from\("profiles"\)/);
  });

  it("reads the setting through a function too, not a select on the column", () => {
    // src/integrations/supabase/types.ts is regenerated from the live database,
    // so a column added by an unpublished migration is unknown to the typed
    // client and a select on it fails the schema check. Two migrations' worth
    // of hand-added types have already been wiped that way.
    expect(fn).toMatch(/rpc\("outcome_consent_state"/);
  });
});

describe("the gate the wording relies on", () => {
  const migration = readFileSync("supabase/migrations/20261121100000_outcome_consent.sql", "utf8");

  it("treats not-asked as not-agreed", () => {
    expect(migration).toMatch(/outcome_consent IS TRUE/);
    // "IS NOT FALSE" would read a never-asked account as a yes, which is the
    // one mistake the tri-state exists to prevent.
    expect(migration).not.toMatch(/outcome_consent IS NOT FALSE/);
  });

  it("gates the view every export and count reads, not each consumer", () => {
    expect(migration).toMatch(/CREATE VIEW public\.training_examples/);
    expect(migration).toMatch(/JOIN public\.profiles consenting/);
  });

  it("keeps capture ungated, so a later yes has history and reporting still works", () => {
    // The snapshots carry bands and counts, no message text and no contact
    // details, and they also feed the customer's own reporting. Consent
    // controls the cross-customer training use, which is what the wording says.
    expect(migration).not.toMatch(/capture_send_snapshot[\s\S]{0,200}outcome_consent/);
  });

  it("writes no price or plan rule, because withdrawing has to be free", () => {
    expect(migration).not.toMatch(/subscription|plan_|stripe|credit/i);
  });
});
