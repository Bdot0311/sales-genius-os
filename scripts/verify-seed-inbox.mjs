#!/usr/bin/env node
/**
 * Prove the placement-test seed inbox is readable, before trusting it.
 *
 * run-placement-test sends a tagged email to a seed mailbox and then reads that
 * mailbox to see which folder it landed in. The read needs a refresh token for
 * the seed account, held as an operator secret. When that token dies, the
 * placement test fails in a way the customer cannot act on, because the seed is
 * ours rather than theirs.
 *
 * This does exactly what the edge function does — exchange the refresh token,
 * confirm the mailbox is the one we think it is, and list a message including
 * spam — so a pass here means a pass there. Run it after minting a new token
 * and before setting the secret, rather than finding out from a failed test.
 *
 *   GOOGLE_CLIENT_ID=... \
 *   GOOGLE_CLIENT_SECRET=... \
 *   DELIVERABILITY_SEED_GMAIL_ADDRESS=outreign.seed@gmail.com \
 *   DELIVERABILITY_SEED_GMAIL_REFRESH=... \
 *   node scripts/verify-seed-inbox.mjs
 *
 * Nothing it prints contains the token.
 */

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}.`);
    process.exit(2);
  }
  return v.trim();
};

const clientId = need("GOOGLE_CLIENT_ID");
const clientSecret = need("GOOGLE_CLIENT_SECRET");
const address = need("DELIVERABILITY_SEED_GMAIL_ADDRESS").toLowerCase();
const refresh = need("DELIVERABILITY_SEED_GMAIL_REFRESH");

const fail = (msg, hint) => {
  console.error(`\n  FAILED  ${msg}`);
  if (hint) console.error(`          ${hint}`);
  process.exit(1);
};

// 1. Exchange the refresh token, the same call the function makes.
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  }).toString(),
});

if (!tokenRes.ok) {
  const body = await tokenRes.text();
  let code = "";
  try { code = String(JSON.parse(body)?.error ?? ""); } catch { /* not JSON */ }
  if (code === "invalid_grant") {
    fail(
      "Google rejected the refresh token (invalid_grant).",
      "It has expired, been revoked, or was minted with a different client ID.\n" +
      "          A token minted while the OAuth consent screen is in Testing expires\n" +
      "          after 7 days. Publish the consent screen first, then mint again.",
    );
  }
  fail(`Google refused the token (HTTP ${tokenRes.status}${code ? `, ${code}` : ""}).`);
}

const accessToken = (await tokenRes.json()).access_token;
if (!accessToken) fail("Google returned no access token.");
console.log("  ok      refresh token exchanged");

const gmail = (path) =>
  fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

// 2. Confirm the token belongs to the mailbox the secret names. A token for the
//    wrong account reads a real inbox and reports placement for mail that was
//    never sent there.
const profileRes = await gmail("/profile");
if (!profileRes.ok) {
  fail(
    `Could not read the mailbox profile (HTTP ${profileRes.status}).`,
    profileRes.status === 403
      ? "The token is probably missing the gmail.readonly scope."
      : undefined,
  );
}
const actual = String((await profileRes.json()).emailAddress ?? "").toLowerCase();
if (actual !== address) {
  fail(
    `The token belongs to ${actual}, not ${address}.`,
    "You authorised the wrong Google account. Sign out and mint it again as the seed.",
  );
}
console.log(`  ok      token belongs to ${actual}`);

// 3. The read the placement test actually performs: a search that includes
//    spam, because landing in spam is the answer it exists to detect.
const listRes = await gmail("/messages?q=newer_than:7d&includeSpamTrash=true&maxResults=1");
if (!listRes.ok) {
  fail(
    `Could not search the mailbox (HTTP ${listRes.status}).`,
    "This is the exact call run-placement-test makes to find the test message.",
  );
}
const count = ((await listRes.json()).messages ?? []).length;
console.log(`  ok      searched the inbox including spam (${count} recent message${count === 1 ? "" : "s"})`);

console.log("\n  The seed inbox is readable. Set these two as Supabase edge function secrets:");
console.log("    DELIVERABILITY_SEED_GMAIL_ADDRESS");
console.log("    DELIVERABILITY_SEED_GMAIL_REFRESH\n");
