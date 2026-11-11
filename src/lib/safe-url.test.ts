import { describe, expect, it } from "vitest";
import { publicHttpUrl, resolvePublicHost } from "../../supabase/functions/_shared/safe-url";
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
    expect(publicHttpUrl("http://[::ffff:127.0.0.1]/").ok).toBe(false);
    expect(publicHttpUrl("http://[::ffff:7f00:1]/").ok).toBe(false);
    expect(publicHttpUrl("http://[::1]/").ok).toBe(false);
    expect(publicHttpUrl("http://[::]/").ok).toBe(false);
    expect(publicHttpUrl("http://[fe9b::1]/").ok).toBe(false);
    expect(publicHttpUrl("http://[fe80::1]/").ok).toBe(false);
    expect(publicHttpUrl("http://[::ffff:8.8.8.8]/").ok).toBe(true);
    expect(publicHttpUrl("http://secret.internal/latest").ok).toBe(false);
  });

  it("rejects a public name whose lookup answers with a private address", async () => {
    const result = await resolvePublicHost("127.0.0.1.nip.io", async () => ["127.0.0.1"]);
    expect(result).toEqual({ ok: false, reason: "private_dns" });
    const allowed = await resolvePublicHost("tf.example", async () => ["93.184.216.34"]);
    expect(allowed.ok).toBe(true);
    const linkLocal = await resolvePublicHost("webhook.test", async () => ["fe9b::1"]);
    expect(linkLocal).toEqual({ ok: false, reason: "private_dns" });
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
