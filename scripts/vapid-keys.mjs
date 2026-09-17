#!/usr/bin/env node
/**
 * Check or mint the VAPID key pair that signs push notifications.
 *
 * Web Push signs every send with a private key, and the push service verifies
 * that signature against the public key the browser registered under. Apple and
 * Google answer a bad signature with 401 or 403 — the same statuses a genuinely
 * refused device gives — so a private key that no longer pairs with the public
 * one is indistinguishable from every device being rejected. It fails silently,
 * permanently, and the obvious remedy (re-register the device) rebuilds the half
 * that was already fine.
 *
 * The public key is a constant in two source files. The private key is a
 * Supabase secret. Rotating means changing all three, and whichever is missed
 * breaks notifications with no visible cause.
 *
 * Check the secret you have against the public key in the tree:
 *
 *   VAPID_PRIVATE_KEY=... node scripts/vapid-keys.mjs check
 *
 * Or mint a fresh matched pair and be told exactly what to change:
 *
 *   node scripts/vapid-keys.mjs generate
 *
 * Neither mode ever prints an existing private key.
 */

import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const PUBLIC_KEY_SOURCES = [
  "src/lib/push.ts",
  "supabase/functions/send-push-notification/index.ts",
];

const b64u = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64u = (s) => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
};

/** Every place the public key is written down, so a rotation cannot half-land. */
function readPublicKeys() {
  const found = [];
  for (const file of PUBLIC_KEY_SOURCES) {
    const src = readFileSync(file, "utf8");
    const match = src.match(/"(B[A-Za-z0-9_-]{85,87})"/);
    found.push({ file, key: match?.[1] ?? null });
  }
  return found;
}

async function keysAgree(publicKey, privateKey) {
  const pub = fromB64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    return { ok: false, why: `public key is ${pub.length} bytes, expected 65 starting 0x04` };
  }
  const priv = fromB64u(privateKey);
  if (priv.length !== 32) {
    return { ok: false, why: `private key is ${priv.length} bytes, expected 32 — a PEM or a JSON blob lands here` };
  }
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: b64u(priv),
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
    ext: true,
  };
  try {
    const signing = await webcrypto.subtle.importKey(
      "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
    const verifying = await webcrypto.subtle.importKey(
      "raw", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    const probe = new TextEncoder().encode("vapid-key-pair-probe");
    const sig = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signing, probe);
    const verified = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, verifying, sig, probe,
    );
    return verified
      ? { ok: true }
      : { ok: false, why: "a signature made with this private key does not verify against the public key" };
  } catch (e) {
    return { ok: false, why: `this private key does not belong to the public key (${e.message})` };
  }
}

async function check() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Set VAPID_PRIVATE_KEY to the value held as the Supabase secret.");
    console.error("  VAPID_PRIVATE_KEY=... node scripts/vapid-keys.mjs check");
    process.exit(2);
  }

  const sources = readPublicKeys();
  let failed = false;

  for (const { file, key } of sources) {
    if (!key) {
      console.error(`✗ ${file} — no VAPID public key found`);
      failed = true;
      continue;
    }
    console.log(`  ${file} → ${key.slice(0, 12)}…${key.slice(-6)}`);
  }
  const distinct = new Set(sources.map((s) => s.key).filter(Boolean));
  if (distinct.size > 1) {
    console.error("\n✗ The two source files carry different public keys. A rotation half-landed.");
    failed = true;
  }

  const publicKey = sources[0]?.key;
  if (publicKey) {
    const result = await keysAgree(publicKey, privateKey);
    if (result.ok) {
      console.log("\n✓ The private key pairs with the public key in the tree. Signing is correct.");
      console.log("  A 401 or 403 from here on really is about the device, not the key.");
    } else {
      console.error(`\n✗ ${result.why}`);
      console.error("  Every push will come back 401 or 403 until this matches.");
      console.error("  Run `node scripts/vapid-keys.mjs generate` for a fresh matched pair.");
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

async function generate() {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = await webcrypto.subtle.exportKey("raw", pair.publicKey);
  const publicKey = b64u(raw);
  const privateKey = jwk.d;

  const verified = await keysAgree(publicKey, privateKey);
  if (!verified.ok) {
    console.error(`Generated a pair that does not verify: ${verified.why}`);
    process.exit(1);
  }

  console.log("A fresh, verified VAPID pair.\n");
  console.log("1. Set this as the Supabase secret VAPID_PRIVATE_KEY:\n");
  console.log(`   ${privateKey}\n`);
  console.log("2. Replace the public key constant in both files:\n");
  for (const file of PUBLIC_KEY_SOURCES) console.log(`   ${file}`);
  console.log(`\n   "${publicKey}"\n`);
  console.log("3. Redeploy send-push-notification and ship the client.\n");
  console.log("Every device has to re-register after this: a subscription is bound to the");
  console.log("key it was created under. refreshPushSubscription does that on app load, so");
  console.log("nobody has to touch the switch — but nothing arrives until they next open it.");
}

const mode = process.argv[2];
if (mode === "check") await check();
else if (mode === "generate") await generate();
else {
  console.error("Usage:");
  console.error("  VAPID_PRIVATE_KEY=... node scripts/vapid-keys.mjs check");
  console.error("  node scripts/vapid-keys.mjs generate");
  process.exit(2);
}
