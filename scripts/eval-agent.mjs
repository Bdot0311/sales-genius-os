#!/usr/bin/env node
/**
 * Behavioural eval runner for the AI SDR agent.
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ACCESS_TOKEN=<user JWT> \
 *   SUPABASE_ANON_KEY=<anon key from .env> \
 *   npm run eval:agent
 *
 * Calls the agent-test edge function in { mode: "behaviour" }, which runs each
 * scenario as its own agent-chat turn and scores what the agent DID.
 */
import fs from "node:fs";
import path from "node:path";

function readEnvFile() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const fileEnv = readEnvFile();
const url = process.env.SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;

const missing = [
  !url && "SUPABASE_URL",
  !anonKey && "SUPABASE_ANON_KEY",
  !token && "SUPABASE_ACCESS_TOKEN (a signed-in user JWT)",
].filter(Boolean);

if (missing.length) {
  console.error(`Missing required env: ${missing.join(", ")}`);
  process.exit(2);
}

// Scenario ids come from the shared definition file, so the runner cannot
// drift from the suite. Each one is its own request: a full agent turn is slow
// and eight of them exceed the edge function's idle timeout.
function scenarioIds() {
  const file = path.resolve(process.cwd(), "supabase/functions/_shared/agent-scenarios.ts");
  const src = fs.readFileSync(file, "utf8");
  const body = src.slice(src.indexOf("AGENT_SCENARIOS: AgentScenario[]"));
  return [...body.matchAll(/^\s{4}id: "([^"]+)"/gm)].map((m) => m[1]);
}

async function runScenario(id) {
  const res = await fetch(`${url}/functions/v1/agent-test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "behaviour", scenarioIds: [id] }),
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!data?.success) {
      return { results: [{ id, passed: false, error: data?.error ?? `HTTP ${res.status}` }] };
    }
    return data;
  } catch {
    return { results: [{ id, passed: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }] };
  }
}

const ids = scenarioIds();
if (ids.length === 0) {
  console.error("No scenarios found in supabase/functions/_shared/agent-scenarios.ts");
  process.exit(2);
}

const data = { results: [], passed: 0, failed: 0, total: 0 };
for (const id of ids) {
  const part = await runScenario(id);
  for (const r of part.results ?? []) {
    data.results.push(r);
    data.total++;
    if (r.passed) data.passed++;
    else data.failed++;
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(`${mark}  ${r.id}${r.error ? ` — ${r.error}` : ""}`);
    if (!r.passed && r.explanation) console.log(`      ${r.explanation}`);
  }
}

console.log(`\n${data.passed}/${data.total} scenarios passed (${data.failed} failed)`);
process.exit(data.failed > 0 ? 1 : 0);
