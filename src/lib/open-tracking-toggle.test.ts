import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const TOGGLE = readFileSync("src/components/deliverability/OpenTrackingToggle.tsx", "utf8");
const PAGE = readFileSync("src/pages/Deliverability.tsx", "utf8");
const SCHEMA = readFileSync(
  "supabase/migrations/20260901120000_deliverability_insights_schema.sql",
  "utf8",
);

/**
 * deliverability_preferences.open_tracking_enabled was created with a comment
 * promising the UI would make the cost visible rather than flipping the
 * default silently. Then nothing wrote it and send-email never read it, so
 * every account carried an open pixel it had never been offered a way to
 * decline — and the answer to "where do I turn this off" was nowhere.
 */
describe("the preference is actually read on send", () => {
  it("send-email looks it up", () => {
    expect(SEND).toContain("deliverability_preferences");
    expect(SEND).toContain("open_tracking_enabled");
  });

  it("omits the pixel when it is off", () => {
    const block = SEND.slice(SEND.indexOf("let openTrackingEnabled"));
    expect(block.slice(0, 1200)).toContain("openTrackingEnabled\n        ? clickTrackedHtml.replace");
  });

  it("leaves click tracking alone", () => {
    // Clicks rewrite a link the reader chose to follow, so they cost nothing
    // in placement and the number means something.
    const block = SEND.slice(SEND.indexOf("let openTrackingEnabled"));
    expect(block.slice(0, 1400)).toContain("injectClickTracking");
  });

  it("defaults to ON when the lookup fails", () => {
    // A database hiccup must not silently change what an account sends.
    expect(SEND).toContain("let openTrackingEnabled = true;");
    const block = SEND.slice(SEND.indexOf("let openTrackingEnabled"));
    expect(block.slice(0, 1200)).toMatch(/catch[\s\S]{0,200}defaulting to on/i);
  });

  it("only turns off on an explicit false, not on a missing row", () => {
    expect(SEND).toContain("prefs.open_tracking_enabled === false");
  });
});

describe("the toggle exists and is reachable", () => {
  it("is mounted on the deliverability page", () => {
    expect(PAGE).toContain("OpenTrackingToggle");
    expect(PAGE).toContain('title="Tracking"');
  });

  it("upserts, because most accounts have no preferences row yet", () => {
    expect(TOGGLE).toContain(".upsert(");
    expect(TOGGLE).toContain('onConflict: "user_id"');
  });

  it("conflicts on a column the table can actually conflict on", () => {
    // An onConflict with no matching unique index fails at runtime, which is
    // exactly how the email_drafts dedupe broke before it was caught.
    expect(SCHEMA).toContain("user_id uuid PRIMARY KEY REFERENCES auth.users(id)");
  });

  it("treats a missing row as tracking on, matching the column default", () => {
    expect(TOGGLE).toContain("data.open_tracking_enabled !== false : true");
    expect(SCHEMA).toContain("open_tracking_enabled boolean NOT NULL DEFAULT true");
  });

  it("rolls the switch back when the save fails", () => {
    expect(TOGGLE).toContain("setEnabled(previous ?? true)");
  });

  it("says what turning it off costs, not only what it buys", () => {
    // A toggle that argues one way is not a choice.
    expect(TOGGLE.replace(/\s+/g, " ")).toMatch(/stops the open rate/i);
    expect(TOGGLE.replace(/\s+/g, " ")).toMatch(/Click tracking, replies and bounces are unaffected/i);
  });
});
