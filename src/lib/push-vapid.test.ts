import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkVapidKeyPair } from "../../supabase/functions/_shared/vapid-keypair";

const CLIENT = readFileSync("src/lib/push.ts", "utf8");
const FN = readFileSync("supabase/functions/send-push-notification/index.ts", "utf8");
const SCRIPT = readFileSync("scripts/vapid-keys.mjs", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const b64u = (bytes: Uint8Array | ArrayBuffer) =>
  Buffer.from(bytes as Uint8Array).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const freshPair = async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
  return { publicKey: b64u(raw), privateKey: jwk.d as string };
};

/**
 * A push that is rejected before it leaves, forever, with no visible cause.
 *
 * Web Push signs every send with a private key and the push service verifies it
 * against the public key the browser registered under. Apple and Google answer
 * a bad signature with 401 or 403 — the same statuses a genuinely refused
 * device gives. So a private key that no longer pairs with the public one looks
 * exactly like every device being rejected, and the advice that follows from
 * that reading ("turn the switch off and on again") rebuilds the half that was
 * already fine and can never work.
 */
describe("the signing key is proven before the device is blamed", () => {
  it("accepts a pair that belongs together", async () => {
    const { publicKey, privateKey } = await freshPair();
    expect(await checkVapidKeyPair(publicKey, privateKey)).toEqual({ ok: true });
  });

  it("catches a private key from a different pair", async () => {
    const mine = await freshPair();
    const theirs = await freshPair();
    const result = await checkVapidKeyPair(mine.publicKey, theirs.privateKey);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ problem: "mismatched" });
  });

  it("calls a missing secret missing rather than mismatched", async () => {
    const { publicKey } = await freshPair();
    expect(await checkVapidKeyPair(publicKey, "")).toMatchObject({ problem: "missing" });
  });

  it("survives the whitespace a pasted secret carries", async () => {
    // A secret typed into a dashboard field arrives with whatever the clipboard
    // had. atob tolerates a stray newline, but CRLF threw outright — so a
    // correct key read as malformed and sent an operator looking for a problem
    // that was not in the key.
    const { publicKey, privateKey } = await freshPair();
    for (const [label, value] of [
      ["trailing newline", `${privateKey}\n`],
      ["surrounding spaces", ` ${privateKey}  `],
      ["CRLF", `${privateKey}\r\n`],
    ] as const) {
      expect(await checkVapidKeyPair(publicKey, value), label).toEqual({ ok: true });
    }
    expect(await checkVapidKeyPair(`${publicKey}\n`, privateKey)).toEqual({ ok: true });
  });

  it("still rejects a key that is genuinely the wrong size, and says so", async () => {
    const { publicKey } = await freshPair();
    const result = await checkVapidKeyPair(publicKey, b64u(new Uint8Array(16)));
    expect(result).toMatchObject({ problem: "malformed" });
    // The detail names the fault without carrying any of the key.
    expect((result as { detail: string }).detail).toContain("16 bytes");
  });

  it("names the fault in the message an operator actually reads", () => {
    // "not in the format the push services require" alone sends them log-diving
    // for a length they could have been told.
    expect(code(FN)).toContain("${keyCheck.detail}");
  });

  it("trims the secrets before using them", () => {
    expect(code(FN)).toContain('(Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim()');
    expect(code(FN)).toContain('(Deno.env.get("VAPID_SUBJECT") ?? "").trim()');
  });

  it("calls a PEM or a truncated key malformed, which is a different thing to fix", async () => {
    const { publicKey } = await freshPair();
    expect(
      await checkVapidKeyPair(publicKey, "-----BEGIN PRIVATE KEY-----MIGH"),
    ).toMatchObject({ problem: "malformed" });
    expect(
      await checkVapidKeyPair(publicKey, b64u(new Uint8Array(16))),
    ).toMatchObject({ problem: "malformed" });
  });

  it("checks before sending, so no device is blamed for a server key", () => {
    const fn = code(FN);
    expect(fn).toContain("await checkVapidKeyPair(VAPID_PUBLIC, VAPID_PRIVATE)");
    expect(fn.indexOf("checkVapidKeyPair")).toBeLessThan(fn.indexOf("webpush.setVapidDetails"));
  });

  it("says whose problem it is, and does not ask for a pointless re-register", () => {
    const mismatch = code(FN).slice(
      code(FN).indexOf("if (!keyCheck.ok)"),
      code(FN).indexOf("webpush.setVapidDetails"),
    );
    expect(mismatch).toContain("this one is ours to fix");
    expect(mismatch).not.toContain("Turn the switch off and on");
  });

  it("logs the provider's own body, which is where the reason is", () => {
    expect(code(FN)).toContain('(err as { body?: string }).body');
  });
});

/**
 * The public key is written down twice and the private key lives somewhere
 * else entirely, so a rotation has three places to land and fails silently if
 * it lands in two.
 */
describe("the public key cannot drift between client and server", () => {
  const keyIn = (src: string) => src.match(/"(B[A-Za-z0-9_-]{85,87})"/)?.[1];

  it("is the same key in both files", () => {
    const client = keyIn(CLIENT);
    const server = keyIn(FN);
    expect(client, "client VAPID public key").toBeTruthy();
    expect(server, "server VAPID public key").toBe(client);
  });

  it("is a real uncompressed P-256 point, not a truncated paste", () => {
    const bytes = Buffer.from(
      (keyIn(CLIENT) as string).replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("has a script that checks the secret without printing it", () => {
    expect(SCRIPT).toContain("scripts/vapid-keys.mjs check");
    expect(SCRIPT).toContain("scripts/vapid-keys.mjs generate");
    // Both files it has to change, named in the script rather than remembered.
    expect(SCRIPT).toContain('"src/lib/push.ts"');
    expect(SCRIPT).toContain('"supabase/functions/send-push-notification/index.ts"');
    // Check mode is handed the key by the environment and never echoes it.
    // Generate mode has to print the one it just minted, which is the point of
    // it, so the rule is scoped to check.
    expect(SCRIPT).toContain("process.env.VAPID_PRIVATE_KEY");
    const checkMode = SCRIPT.slice(
      SCRIPT.indexOf("async function check()"),
      SCRIPT.indexOf("async function generate()"),
    );
    expect(checkMode).toBeTruthy();
    expect(checkMode).not.toMatch(/console\.(log|error)\([^)]*privateKey/);
  });
});
