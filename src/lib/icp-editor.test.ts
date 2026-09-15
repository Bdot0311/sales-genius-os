import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ICP = readFileSync("src/pages/ICP.tsx", "utf8");
const CHAT = readFileSync("src/pages/AgentChat.tsx", "utf8");
const SETTINGS = readFileSync("src/pages/Settings.tsx", "utf8");

/**
 * The screens people work in, not the lists in front of them.
 *
 * The first pass rebuilt the ICP list and left the editor it opens; it rebuilt
 * the agent page and left the chat. Those are where the time actually goes.
 */
describe("the icp editor", () => {
  it("has one vocabulary for picking something", () => {
    // There were four: a solid primary badge for a selected option, an outlined
    // one for an unselected one, a "secondary" one for a tag you typed, and a
    // rounded pill prefixed with a plus for a suggestion.
    //
    // This first pinned where the shared mark was declared, which broke the
    // moment it moved into Panel.tsx so that Outreach could use it too — a
    // change that made it more correct. What matters is that all three
    // choosers on this screen draw the same mark, and that none of the old
    // vocabularies survive.
    expect(ICP).not.toMatch(/<Badge\b/);
    expect(ICP).not.toContain('variant={value.includes(opt) ? "default" : "outline"}');
    expect(ICP).not.toContain("rounded-full bg-muted hover:bg-muted/70");
    for (const chooser of ["function TagInput", "function MultiSelect"]) {
      const body = ICP.slice(ICP.indexOf(chooser), ICP.indexOf("}", ICP.indexOf(chooser)) + 4000);
      expect(body, chooser).toContain("<Chip");
    }
  });

  it("does not render thirty-six options at once", () => {
    // One field's control filled a screen, and six of them in a two-column grid
    // were unusable on a phone.
    expect(ICP).toContain("const LIMIT = 12");
    expect(ICP).toContain("const long = options.length > LIMIT");
    // What you already picked surfaces, so opening it is never how you find out.
    expect(ICP).toContain("options.filter((o) => value.includes(o))");
  });

  it("every field says what it is for", () => {
    expect(ICP).toContain("const Field = (");
    expect(ICP).not.toMatch(/<Label>[A-Z]/);
    expect(ICP.match(/<Field label=/g) ?? []).toHaveLength(33);
  });

  it("the tab strip and the save bar stay put while the form scrolls", () => {
    // The whole sheet scrolled, so the tabs left the screen on the second field
    // and the only way back to another section was scrolling up.
    expect(ICP).toContain("flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl");
    expect(ICP).toContain("min-h-0 flex-1 overflow-y-auto px-5 py-4");
    expect(ICP).not.toContain("sticky bottom-0 bg-background");
  });

  it("delete is not a red icon button beside save", () => {
    expect(ICP).toContain("Delete ICP");
    expect(ICP).toContain("Cancel");
    expect(ICP).not.toContain('<Button variant="destructive" size="icon"');
  });

  it("the weights total is not a traffic light", () => {
    // Green when the arithmetic is right and yellow when it is not says good
    // and bad about a sum.
    expect(ICP).not.toContain('total === 100 ? "text-green-500" : "text-yellow-500"');
    expect(ICP).toContain("need to add up to 100");
  });

  it("drops the icon table nothing read", () => {
    expect(ICP).not.toContain("const SECTION_ICONS");
  });

  it("its inputs do not make iOS zoom", () => {
    expect(ICP).toContain("text-base sm:text-[0.8125rem]");
  });
});

describe("the agent chat", () => {
  it("the thread list and the conversation share one surface", () => {
    expect(CHAT).toContain("lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]");
    expect(CHAT).not.toContain("flex flex-col lg:flex-row gap-4 h-[calc(100dvh-5rem)]");
  });

  it("what you typed is not the heaviest thing on the screen", () => {
    // A solid primary block per sent message, on a screen whose content is the
    // agent's replies.
    expect(CHAT).not.toContain("rounded-2xl rounded-br-sm bg-primary px-4");
    expect(CHAT).toContain("rounded-lg bg-primary/15 px-3.5 py-2.5");
  });

  it("does not illustrate the words beside it", () => {
    // A tinted tile holding a robot, next to "Chat with your AI SDR"; and a
    // 28px one over "Hand the work over".
    expect(CHAT).not.toContain("p-1.5 rounded-lg bg-primary/15");
    expect(CHAT).not.toContain("inline-flex p-3 rounded-2xl bg-primary/10");
    expect(CHAT).not.toContain("lucide-react\");\nimport");
    expect(CHAT).not.toMatch(/<Bot\b/);
  });

  it("the active thread is not marked the same way a message is", () => {
    expect(CHAT).toContain('t.id === threadId ? "bg-muted/60 text-foreground"');
  });
});

describe("the settings rail", () => {
  it("does not ride up over the page header", () => {
    // Sticky, it sat across "Account, preferences, and billing" as soon as the
    // page scrolled, and being taller than what it stuck to its first entries
    // were clipped off the top.
    expect(SETTINGS).not.toContain("lg:sticky lg:top-4");
  });

  it("reads as one surface rather than fifteen loose words", () => {
    expect(SETTINGS).toContain("lg:rounded-xl lg:border lg:border-border/50 lg:bg-card");
  });
});
