import { describe, expect, it } from "vitest";
import { publicHttpUrl } from "../../supabase/functions/_shared/safe-url";
import { replayDecision } from "../../supabase/functions/_shared/mutation-replay";

describe("cited URLs are refused before a request", () => {
  it("blocks localhost, metadata, and private addresses", () => {
    expect(publicHttpUrl("http://localhost/about").ok).toBe(false);
    expect(publicHttpUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(publicHttpUrl("http://10.1.2.3/").ok).toBe(false);
    expect(publicHttpUrl("http://192.168.1.1/").ok).toBe(false);
    expect(publicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(publicHttpUrl("https://user:pass@tf.example/").ok).toBe(false);
    expect(publicHttpUrl("https://tf.example/about").ok).toBe(true);
  });
});

describe("a dispatch row blocks a second run", () => {
  it("skips dispatching, completed, and unknown, and runs only a missing row", () => {
    expect(replayDecision("dispatching")).toBe("skip");
    expect(replayDecision("completed")).toBe("skip");
    expect(replayDecision("unknown")).toBe("skip");
    expect(replayDecision(null)).toBe("run");
  });
});
