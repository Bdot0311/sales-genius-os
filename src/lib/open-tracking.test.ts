import { describe, expect, it } from "vitest";
import {
  classifyOpen,
  graceSecondsFor,
  isAppleMpp,
  isAssistedOpen,
  isProxyAgent,
} from "../../supabase/functions/_shared/open-tracking.ts";

const GMAIL_PROXY =
  "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const hit = (over: Partial<Parameters<typeof classifyOpen>[0]>) =>
  classifyOpen({
    userAgent: CHROME,
    secondsSinceSend: 86_400,
    secondsSinceLastCounted: null,
    ownMailbox: false,
    ...over,
  });

/**
 * The reported symptom: "once I send an email 2 mins later it says opened".
 * These are the real seconds_since_send values of counted opens pulled from
 * email_open_events, all of them under fifteen minutes, nine of the ten
 * carrying Gmail's proxy agent.
 */
describe("the sub-15-minute opens that were being counted", () => {
  const REPORTED = [116, 124, 174, 377, 382, 402, 420, 459];

  it.each(REPORTED)("stops counting a Gmail-proxy hit at %is", (seconds) => {
    const v = hit({ userAgent: GMAIL_PROXY, secondsSinceSend: seconds });
    expect(v.counted).toBe(false);
    expect(v.skipReason).toBe("provider_prefetch");
  });

  it("stops counting the bare Mozilla/5.0 hit at 487s", () => {
    const v = hit({ userAgent: "Mozilla/5.0", secondsSinceSend: 487 });
    expect(v.counted).toBe(false);
    expect(v.skipReason).toBe("apple_mpp");
  });
});

describe("what still counts", () => {
  it("counts a Gmail-proxy hit once the delivery window has passed", () => {
    // Gmail routes real opens through the same proxy as its prefetch. Filtering
    // the agent outright would erase every Gmail open in the product.
    const v = hit({ userAgent: GMAIL_PROXY, secondsSinceSend: 4 * 3600 });
    expect(v.counted).toBe(true);
    expect(v.skipReason).toBeNull();
  });

  it("counts an ordinary client open minutes after send", () => {
    expect(hit({ secondsSinceSend: 300 }).counted).toBe(true);
  });

  it("counts an open when the send has no timestamp to measure against", () => {
    expect(hit({ secondsSinceSend: null }).counted).toBe(true);
  });
});

describe("the rest of the guards survive the rewrite", () => {
  it("drops a security appliance", () => {
    expect(hit({ userAgent: "Mimecast Link Checker" }).skipReason).toBe("scanner_user_agent");
  });

  it("drops a hit inside the short window for a direct client", () => {
    expect(hit({ secondsSinceSend: 30 }).skipReason).toBe("provider_prefetch");
  });

  it("drops warmup traffic to the sender's own mailbox", () => {
    expect(hit({ ownMailbox: true }).skipReason).toBe("own_mailbox_warmup");
  });

  it("drops a repeat fetch of the same render", () => {
    expect(hit({ secondsSinceLastCounted: 5 }).skipReason).toBe("duplicate_render");
  });

  it("counts a second open a day later", () => {
    expect(hit({ secondsSinceLastCounted: 86_400 }).counted).toBe(true);
  });
});

describe("agent detection", () => {
  it("recognises Gmail's proxy and gives it the longer window", () => {
    expect(isProxyAgent(GMAIL_PROXY)).toBe(true);
    expect(graceSecondsFor(GMAIL_PROXY)).toBeGreaterThan(graceSecondsFor(CHROME));
  });

  it("recognises MPP only on a stripped agent, never on a real browser", () => {
    expect(isAppleMpp("Mozilla/5.0")).toBe(true);
    expect(isAppleMpp("Mozilla/5.0 ()")).toBe(true);
    expect(isAppleMpp(CHROME)).toBe(false);
    expect(isAppleMpp(GMAIL_PROXY)).toBe(false);
  });

  it("separates machine fetches from the hits that prove nothing", () => {
    // Delivered-and-rendered is worth reporting; a scanner is not.
    expect(isAssistedOpen("apple_mpp")).toBe(true);
    expect(isAssistedOpen("provider_prefetch")).toBe(true);
    expect(isAssistedOpen("scanner_user_agent")).toBe(false);
    expect(isAssistedOpen(null)).toBe(false);
  });
});
