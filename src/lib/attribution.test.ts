import { describe, it, expect, beforeEach, vi } from "vitest";

/** Loads attribution.ts fresh with a faked referrer + landing URL. */
async function visit(referrer: string, url = "https://outreign.io/") {
  vi.resetModules();
  const u = new URL(url);
  vi.stubGlobal("window", {
    location: { search: u.search, pathname: u.pathname, hostname: u.hostname },
  });
  vi.stubGlobal("document", { referrer });
  const storage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    } as unknown as Storage;
  };
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("localStorage", storage());
  const mod = await import("./attribution");
  return mod.initAttribution();
}

describe("attribution: social + AI referrers", () => {
  beforeEach(() => vi.unstubAllGlobals());

  const cases: Array<[string, string, string]> = [
    ["https://x.com/someone/status/1", "x", "social"],
    ["https://twitter.com/someone", "x", "social"],
    ["https://t.co/abc", "x", "social"],
    ["https://www.linkedin.com/feed/", "linkedin", "social"],
    ["https://lnkd.in/abc", "linkedin", "social"],
    ["https://www.reddit.com/r/sales/", "reddit", "social"],
    ["https://redd.it/abc", "reddit", "social"],
    ["https://chatgpt.com/", "ai-assistant", "referral"],
    ["https://chat.openai.com/", "ai-assistant", "referral"],
    ["https://www.perplexity.ai/search", "ai-assistant", "referral"],
    ["https://claude.ai/chat/1", "ai-assistant", "referral"],
    ["https://gemini.google.com/app", "ai-assistant", "referral"],
    ["https://copilot.microsoft.com/", "ai-assistant", "referral"],
    ["https://grok.com/", "ai-assistant", "referral"],
  ];

  for (const [referrer, source, medium] of cases) {
    it(`tags ${referrer} as ${source}`, async () => {
      const props = await visit(referrer);
      expect(props.utm_source).toBe(source);
      expect(props.utm_medium).toBe(medium);
      expect(props.traffic_channel).toBe(medium);
      expect(props.first_touch_source).toBe(source);
    });
  }

  it("keeps real Google search as organic", async () => {
    const props = await visit("https://www.google.com/search?q=outreign");
    expect(props.utm_source).toBe("google");
    expect(props.utm_medium).toBe("organic");
  });

  it("utm params win over referrer", async () => {
    const props = await visit("https://x.com/", "https://outreign.io/?utm_source=newsletter&utm_medium=email");
    expect(props.utm_source).toBe("newsletter");
    expect(props.utm_medium).toBe("email");
  });

  it("no referrer stays direct", async () => {
    const props = await visit("");
    expect(props.utm_source).toBe("direct");
    expect(props.traffic_channel).toBe("direct");
  });
});
