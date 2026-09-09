import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * On a phone the conversation was a sliver.
 *
 * The layout stacks on mobile (flex-col, lg:flex-row), and the thread list was
 * pinned at max-h-[34vh] with flex-shrink-0 — so a third of the screen went to
 * history before a single message rendered. The chat card's own header then
 * took a title, a strapline and two full-width selects stacked on top of each
 * other, and what remained for the messages was a few lines.
 *
 * None of it was wrong on a desktop, which is why it survived: at lg the list
 * is a 16rem sidebar and the header is one row.
 */
const PAGE = readFileSync("src/pages/AgentChat.tsx", "utf8");

describe("the thread list does not take the screen on mobile", () => {
  it("is collapsed by default and only there when opened", () => {
    expect(PAGE).toContain("const [historyOpen, setHistoryOpen] = useState(false)");
    expect(PAGE).toContain('!historyOpen && "hidden lg:block"');
  });

  it("is not rendered at all while collapsed", () => {
    // Short was not enough. A Card wrapping one button still costs a border,
    // p-3 and the parent's gap-4 — most of a message on a phone — so when
    // collapsed it leaves the layout entirely rather than shrinking.
    expect(PAGE).not.toContain("max-h-[34vh]");
    expect(PAGE).toContain('historyOpen ? "flex max-h-[45vh]" : "hidden max-h-none"');
  });

  it("keeps its controls reachable once the card is gone", () => {
    // Back, New chat and the toggle live in the sidebar on lg; below it the
    // sidebar is collapsed, so the header carries them.
    const header = PAGE.slice(PAGE.indexOf("Thread controls, mobile only"));
    expect(header.slice(0, 900)).toContain("lg:hidden");
    expect(header.slice(0, 900)).toContain("New chat");
    expect(header.slice(0, 900)).toContain("Back to agent");
  });

  it("is capped when open, so it can never take over either", () => {
    expect(PAGE).toContain("max-h-[45vh]");
  });

  it("keeps the desktop sidebar untouched", () => {
    expect(PAGE).toContain("w-full lg:w-64");
    expect(PAGE).toContain("lg:max-h-none");
  });

  it("has a labelled control, since the list is hidden behind it", () => {
    expect(PAGE).toMatch(/aria-expanded=\{historyOpen\}/);
    expect(PAGE).toMatch(/Show conversations/);
  });
});

describe("the chat header earns its height on mobile", () => {
  it("drops the title block below sm, since the New chat row identifies the pane", () => {
    expect(PAGE).toContain('className="hidden items-center gap-2 min-w-0 sm:flex"');
  });

  it("drops the strapline on a phone", () => {
    // Onboarding copy, and it cost a line of the conversation on every turn.
    expect(PAGE).toContain('className="hidden text-xs text-muted-foreground truncate sm:block"');
  });

  it("puts the two selects on one row instead of stacking them full width", () => {
    expect(PAGE).not.toContain('className="w-full min-w-0 sm:w-[190px]"');
    expect(PAGE).not.toContain('className="w-full min-w-0 sm:w-[168px]"');
    expect(PAGE).toContain("flex-1 min-w-0 sm:flex-none sm:w-[190px]");
    expect(PAGE).toContain("flex-1 min-w-0 sm:flex-none sm:w-[168px]");
  });

  it("still gives the messages the remaining space", () => {
    // The scroll area is what should absorb whatever is left over.
    expect(PAGE).toContain('<ScrollArea className="flex-1 min-h-0 px-3 sm:px-4">');
  });
});
