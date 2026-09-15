import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const INBOX = readFileSync("src/pages/Inbox.tsx", "utf8");
const CALENDAR = readFileSync("src/pages/Calendar.tsx", "utf8");
const HEALTH = readFileSync("src/components/deliverability/HealthOverview.tsx", "utf8");
const PANEL = readFileSync("src/components/dashboard/Panel.tsx", "utf8");
const DELIVERABILITY_FILES = [
  "AccountHealthGrid", "AccountSendLimit", "AlertsPanel", "ConnectionHealthGrid",
  "DomainAuthPanel", "EventTimeline", "HealthOverview", "OpenTrackingToggle",
  "PlacementPanel", "RecoveryLedger", "SpamCheckerPanel", "VerdictTile", "WarmupPanel",
].map((n) => [n, readFileSync(`src/components/deliverability/${n}.tsx`, "utf8")] as const);

/**
 * The third batch of pages moved onto the shared surfaces.
 *
 * As before these check the specific thing each page was doing differently from
 * the rest of the product, not that the result looks nice.
 */
describe("inbox", () => {
  it("the list and the thread share one surface", () => {
    // Two separately bordered boxes with a gap down the middle made the most
    // familiar two-pane layout there is read as two unrelated cards.
    expect(INBOX).toContain("<Panel");
    expect(INBOX).toContain("md:grid-cols-[19rem_minmax(0,1fr)]");
    expect(INBOX).not.toMatch(/flex gap-4 h-\[calc/);
  });

  it("every folder carries its count", () => {
    // Picking a folder was otherwise a guess about whether it held anything.
    expect(INBOX).toContain("const counts = useMemo");
    expect(INBOX).toContain("{counts[f.value]}");
  });

  it("the current folder is not the loudest thing on the page", () => {
    expect(INBOX).not.toContain("bg-primary text-primary-foreground");
  });

  it("unread sits in a gutter so names stay aligned", () => {
    expect(INBOX).toContain("flex w-1.5 shrink-0 justify-center");
    expect(INBOX).toContain("rounded-full bg-primary");
  });

  it("messages are not chat bubbles", () => {
    // Right-aligned tinted bubbles at 92% width are a messaging app's shape,
    // and they give a mail thread a line length that changes every message.
    expect(INBOX).not.toContain("ml-auto bg-primary/10");
    expect(INBOX).not.toContain("max-w-[92%]");
    expect(INBOX).toContain("max-w-[68ch]");
  });

  it("the reply box is short until there is something to say", () => {
    expect(INBOX).toContain('draftReply ? "h-24" : "h-10"');
  });

  it("the search field does not make iOS zoom on focus", () => {
    expect(INBOX).toContain("text-base sm:h-8 sm:text-xs");
  });
});

describe("calendar", () => {
  it("both calendars land in one list ordered by time", () => {
    // Google's events were one grid of cards and OutReign's another, under
    // separate headings, never sorted against each other — so a 2pm meeting and
    // a 3pm meeting sat in different halves of the page.
    expect(CALENDAR).toContain("const agenda = useMemo<AgendaEntry[]>");
    expect(CALENDAR).toContain('source: "google"');
    expect(CALENDAR).toContain('source: "outreign"');
    expect(CALENDAR).toContain("a.start.getTime() - b.start.getTime()");
    expect(CALENDAR).not.toContain("Your Booked Meetings");
    // What the second grid rendered per event. The phrase "Your Google
    // Calendar" survives in the reconnect messages, so the heading is not what
    // this can look for.
    expect(CALENDAR).not.toContain('{ev.summary || "(No title)"}');
  });

  it("the day heading answers whether it is today", () => {
    expect(CALENDAR).toContain("const dayLabel");
    expect(CALENDAR).toContain("isToday(d)");
    expect(CALENDAR).toContain("isTomorrow(d)");
  });

  it("is a list, not two grids of identical cards", () => {
    expect(CALENDAR).not.toMatch(/<Card\b/);
    expect(CALENDAR).not.toContain("grid-cols-1 md:grid-cols-2 lg:grid-cols-3");
  });

  it("does not report good news louder than anything else on the page", () => {
    // Connected, the state was a green-bordered green-tinted slab. It is now a
    // line in the footer, and only becomes a panel when there is something to do.
    expect(CALENDAR).toContain('calendarStatus !== "connected" && calendarStatus !== "loading"');
    expect(CALENDAR).not.toContain("border-emerald-500/30 bg-emerald-500/5");
  });

  it("the connect buttons point at a route that exists", () => {
    // One of them carried a dashboard-prefixed path that App.tsx has no route
    // for, so it landed on the not-found page.
    expect(CALENDAR).not.toContain("/dashboard/integrations");
    expect(CALENDAR).toContain('navigate("/integrations")');
  });

  it("schedules from the header, not from a bar whose only job is to right-align", () => {
    expect(CALENDAR).not.toContain("sm:items-center justify-end gap-4");
    expect(CALENDAR).toContain("actions={");
  });
});

describe("deliverability", () => {
  it("every section is built from the dashboard's own surface", () => {
    for (const [name, src] of DELIVERABILITY_FILES) {
      expect(src, name).not.toMatch(/<Card\b/);
      expect(src, name).not.toContain("@/components/ui/card");
    }
  });

  it("no section repeats the heading the page already printed above it", () => {
    // The page prints "Authentication & blacklists", then the panel three lines
    // below it said "Domain authentication & blacklists".
    const auth = DELIVERABILITY_FILES.find(([n]) => n === "DomainAuthPanel")![1];
    const placement = DELIVERABILITY_FILES.find(([n]) => n === "PlacementPanel")![1];
    expect(auth).not.toContain("Domain authentication");
    expect(placement).not.toContain("Inbox placement test");
  });

  it("the overview is one divided surface, not four floating tiles", () => {
    expect(HEALTH).toContain("<Panel className=\"grid");
    expect(HEALTH).not.toContain("grid gap-4 sm:grid-cols-2 lg:grid-cols-4");
    // Four unrelated numbers under four differently-coloured icons read as a
    // legend rather than as readings of the gauge beside them.
    expect(HEALTH).not.toContain("lucide-react");
  });

  it("the dividing rules are told their position rather than guessing it", () => {
    // Selecting them by index in the group would have to be correct at every
    // breakpoint at once, and the wrap point moves between two columns and four.
    expect(HEALTH).toContain('position = "middle"');
    expect(HEALTH).not.toContain("nth-child");
  });
});

describe("the shared surface", () => {
  it("passes a div's own attributes through", () => {
    // A panel reporting a state that changes needs role and aria-live, and
    // those should not each have to become a prop here.
    expect(PANEL).toContain("HTMLAttributes<HTMLDivElement>");
    expect(PANEL).toContain("{...rest}");
  });
});
