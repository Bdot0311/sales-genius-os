#!/usr/bin/env node
/**
 * Run the behavioural eval against the live agent.
 *
 * The scenarios assert what the agent DOES: which tools it called, which it
 * left alone, and what it said. That is a different question from whether the
 * code compiles, so it needs a real account and a real model — which is why it
 * is a script you run rather than something CI can do.
 *
 *   node scripts/run-agent-eval.mjs
 *
 * Needs a user access token, because the agent acts on one account's data:
 *   SUPABASE_URL          https://<project-ref>.supabase.co
 *   SUPABASE_ACCESS_TOKEN a signed-in user's JWT
 *   SUPABASE_ANON_KEY     the project's anon key
 *
 * The token is the one in your browser's local storage under
 * sb-<project-ref>-auth-token, field access_token, after signing in.
 */

const url = process.env.SUPABASE_URL;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const anon = process.env.SUPABASE_ANON_KEY;

if (!url || !token || !anon) {
  console.error(
    "Missing config. Set SUPABASE_URL, SUPABASE_ACCESS_TOKEN and SUPABASE_ANON_KEY.\n" +
      "The access token is a signed-in user's JWT — the eval runs real turns on that account.",
  );
  process.exit(2);
}

const res = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/agent-test`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ mode: "behaviour" }),
});

const body = await res.json().catch(() => null);
if (!res.ok || !body?.success) {
  console.error(`agent-test failed (${res.status}):`, body?.error ?? "no body");
  process.exit(1);
}

const { passed, failed, total, results } = body;

for (const r of results) {
  if (r.passed) {
    console.log(`  pass  ${r.id}`);
    continue;
  }
  // Failures carry what the scenario was protecting against, because "failed"
  // on its own does not tell anyone what to go and look at.
  console.log(`  FAIL  ${r.explanation ?? r.id}`);
  if (r.guards) console.log(`        guards: ${r.guards}`);
  if (r.error) console.log(`        error:  ${r.error}`);
  if (r.calledTools?.length) console.log(`        called: ${r.calledTools.join(", ")}`);
}

console.log(`\n${passed}/${total} scenarios passed.`);
process.exit(failed > 0 ? 1 : 0);
