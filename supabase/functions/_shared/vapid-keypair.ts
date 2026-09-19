/**
 * Prove the VAPID key pair actually pairs, before blaming the device.
 *
 * Web Push signs every send with a private key, and the push service checks
 * that signature against the public key the browser registered with. Apple and
 * Google both answer a bad signature with 401 or 403 — the same statuses a
 * genuinely refused device produces. So a server whose private key no longer
 * matches its public key looks exactly like every device being rejected, and
 * the honest-sounding advice ("turn the switch off and on again") can never
 * work: re-registering rebuilds the half that was already fine.
 *
 * That is not hypothetical here. The public key is a constant compiled into
 * both the client and this function; the private key is a deployment secret.
 * Rotating the pair means changing both, and the one that gets missed fails
 * silently and permanently.
 *
 * The check is cheap and needs no network: a P-256 public key is the point
 * (x, y), and importing a JWK that carries a private scalar alongside a point
 * it does not generate is rejected. Engines differ in how strictly they
 * enforce that at import, so this also signs a probe and verifies it against
 * the public key — a mismatch fails one or the other whatever the engine does.
 */

export type VapidProblem = "missing" | "malformed" | "mismatched";

const b64uToBytes = (s: string): Uint8Array | null => {
  try {
    // Whitespace is stripped before anything else. atob tolerates it, but the
    // padding below is computed from the string's length — so a trailing
    // newline on a pasted secret shifts the padding and decodes a valid key to
    // the wrong number of bytes, which reads as "malformed" and sends an
    // operator looking for a problem that is not in the key.
    const padded = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};

const bytesToB64u = (bytes: Uint8Array): string => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function checkVapidKeyPair(
  publicKey: string,
  privateKey: string,
): Promise<{ ok: true } | { ok: false; problem: VapidProblem; detail: string }> {
  if (!privateKey) return { ok: false, problem: "missing", detail: "VAPID_PRIVATE_KEY is not set" };

  const pub = b64uToBytes(publicKey);
  // An uncompressed P-256 point: a 0x04 tag then 32 bytes of x and 32 of y.
  if (!pub || pub.length !== 65 || pub[0] !== 0x04) {
    return {
      ok: false,
      problem: "malformed",
      detail: `public key is ${pub ? `${pub.length} bytes` : "not base64url"}, expected 65`,
    };
  }

  const priv = b64uToBytes(privateKey);
  // The private half is the scalar d, always 32 bytes on this curve. A PEM or
  // a JSON blob pasted into the secret lands here rather than looking like a
  // mismatch, which is a different thing to go and fix.
  if (!priv || priv.length !== 32) {
    return {
      ok: false,
      problem: "malformed",
      detail: `private key is ${priv ? `${priv.length} bytes` : "not base64url"}, expected 32`,
    };
  }

  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: bytesToB64u(priv),
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    ext: true,
  };

  try {
    const signingKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const verifyingKey = await crypto.subtle.importKey(
      "raw",
      pub as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const probe = new TextEncoder().encode("vapid-key-pair-probe");
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      probe,
    );
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyingKey,
      signature,
      probe,
    );
    if (!verified) {
      return {
        ok: false,
        problem: "mismatched",
        detail: "a signature made with the private key does not verify against the public key",
      };
    }
    return { ok: true };
  } catch (e) {
    // A strict engine refuses the import outright. Same conclusion.
    return {
      ok: false,
      problem: "mismatched",
      detail: `the private key does not belong to the public key (${(e as Error).message})`,
    };
  }
}

/**
 * The `sub` claim, which is the other half of a valid VAPID token.
 *
 * The spec allows a `mailto:` or an `https:` URI and nothing else, and Apple
 * enforces it: a bare email address or a bare domain in this secret produces a
 * 403 BadJwtToken on every send. That is the same status a refused device
 * gives, so it lands the reader on the same dead-end advice as a mismatched
 * key — re-register a device that was never the problem. It is a settable
 * secret, so it is worth checking rather than assuming.
 */
export function checkVapidSubject(
  subject: string,
): { ok: true } | { ok: false; detail: string } {
  const value = (subject ?? "").trim();
  if (!value) return { ok: false, detail: "VAPID_SUBJECT is empty" };
  if (/^mailto:\S+@\S+\.\S+$/i.test(value)) return { ok: true };
  if (/^https:\/\/\S+\.\S+/i.test(value)) return { ok: true };
  return {
    ok: false,
    detail: `VAPID_SUBJECT must be a mailto: address or an https: URL, got "${value.slice(0, 60)}"`,
  };
}
