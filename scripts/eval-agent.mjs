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

const res = await fetch(`${url}/functions/v1/agent-test`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ mode: "behaviour" }),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error(`Non-JSON response (${res.status}): ${text.slice(0, 500)}`);
  process.exit(1);
}

if (!data?.success) {
  console.error(`Eval failed (${res.status}): ${data?.error ?? text.slice(0, 500)}`);
  process.exit(1);
}

const results = Array.isArray(data.results) ? data.results : [];
for (const r of results) {
  const mark = r.passed ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.id}${r.error ? ` — ${r.error}` : ""}`);
  if (!r.passed && r.explanation) console.log(`      ${r.explanation}`);
}

console.log(`\n${data.passed}/${data.total} scenarios passed (${data.failed} failed)`);
process.exit(data.failed > 0 ? 1 : 0);
