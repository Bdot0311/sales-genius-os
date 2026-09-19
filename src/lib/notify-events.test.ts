import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const EVENTS = readFileSync("supabase/functions/_shared/notify-events.ts", "utf8");
const INBOX = readFileSync("supabase/functions/inbox-sync/index.ts", "utf8");
const AGENT = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
const DELIVER = readFileSync("supabase/functions/deliverability-alerts-scan/index.ts", "utf8");
const SETTINGS = readFileSync("src/pages/Settings.tsx", "utf8");
const CSS = readFileSync("src/index.css", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * Exactly one thing in the product sent a notification: the agent finishing a
 * run. A prospect replying, a meeting landing, a sending domain going bad —
 * all silent. The run summary is the one a salesperson can read later; the
 * reply is the one that decays if they read it later.
 */
describe("the events that reach a phone", () => {
  it("tells them a prospect replied", () => {
    expect(code(INBOX)).toContain("notifyRepliesReceived(");
  });

  it("does not wake anyone for an out-of-office", () => {
    // Being buzzed for an auto-reply is how a person learns to turn
    // notifications off, which would cost every other event here too.
    const inbox = code(INBOX);
    expect(inbox).toContain("replies.filter((r) => !r.isAutoReply)");
  });

  it("sends one notification for a batch, not one per reply", () => {
    // A sync that finds six replies must not buzz six times.
    expect(code(EVENTS)).toContain("replies.length === 1");
    expect(code(EVENTS)).toContain("new replies");
  });

  it("tells them a prospect asked for time", () => {
    expect(code(AGENT)).toContain("notifyMeetingBooked(");
  });

  it("tells them when sending breaks, once per problem", () => {
    // Hooked after the insert, which only happens when no active alert exists
    // — so a nightly scan re-finding the same problem stays silent.
    const deliver = code(DELIVER);
    // The call, not the import at the top of the file — which is what a bare
    // search for the name finds, and which sits before everything.
    expect(deliver).toContain("await notifyDeliverabilityAlert(params.user_id");
    expect(deliver.indexOf("await notifyDeliverabilityAlert(")).toBeGreaterThan(
      deliver.indexOf("raised++"),
    );
  });

  it("deep-links to the screen that lets them act", () => {
    const events = code(EVENTS);
    expect(events).toContain('url: "/dashboard/inbox"');
    expect(events).toContain('url: "/dashboard/calendar"');
    expect(events).toContain('url: "/dashboard/deliverability"');
    expect(events).toContain('url: "/dashboard/agent"');
  });

  it("collapses repeatable events and never collapses replies", () => {
    const events = code(EVENTS);
    // Web Push replaces a notification carrying the same tag.
    for (const tag of ["meeting-booked", "agent-run"]) {
      expect(events, tag).toContain(`tag: "${tag}"`);
    }
    expect(events).toContain("tag: `deliverability-${alert.alertType}`");
    // Two replies are two different people waiting; the second must not
    // silently replace the first.
    const replies = events.slice(
      events.indexOf("export async function notifyRepliesReceived"),
      events.indexOf("export async function notifyMeetingBooked"),
    );
    expect(replies).not.toContain("tag:");
  });

  it("claims nothing the caller did not give it", () => {
    // A name invented for a lock screen is a wrong name on a lock screen.
    const agent = code(AGENT);
    expect(agent).not.toContain("reply.fromName");
  });
});

/**
 * The settings tabs on a phone: a strip sliced mid-word at both edges, with
 * the tab you were actually on clipped against the right edge.
 */
describe("the settings tabs say they scroll", () => {
  it("stays a strip rather than becoming the grid that was already reverted", () => {
    // index.css records why: fifteen destinations in two columns built a stack
    // eight rows tall above whatever you came to change.
    expect(SETTINGS).toContain("overflow-x-auto");
    expect(SETTINGS).not.toContain("settings-tab-list grid");
  });

  it("brings the open tab into view instead of leaving it clipped", () => {
    expect(code(SETTINGS)).toContain('.settings-tab-list [data-state="active"]');
    expect(code(SETTINGS)).toContain('inline: "center"');
  });

  it("rests on a tab edge and fades at both ends", () => {
    const block = CSS.match(/@media \(max-width: 1023\.98px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(block).toContain("scroll-snap-type: x proximity");
    expect(block).toContain("scroll-snap-align: start");
    expect(block).toContain("mask-image");
  });

  it("applies those up to lg, where the strip becomes a rail", () => {
    // Scoped to the phone breakpoint, every tablet kept the broken version.
    expect(CSS).toContain("@media (max-width: 1023.98px)");
  });
});
