// Transport for the structured-decision provider (TypeSafe / JEV).
//
// This file knows the wire protocol and NOTHING about leads, emails or
// sequences. Everything product-shaped lives in lead-intelligence.ts, so the
// decision provider can be swapped for another one by rewriting only this file.
//
// API: POST https://api.typesafe.ai/v1/systemone
//      Authorization: Bearer <TYPESAFE_API_KEY>
//      body  { state, model, questions }
//      reply { model, answers, usage? }
// Choice answers carry { type, choice, probabilities, confidence }.

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
const TIMEOUT_MS = 20_000;

export type JevErrorKind = "not_configured" | "timeout" | "malformed" | "rate_limit" | "http" | "unknown";

export class JevError extends Error {
  kind: JevErrorKind;
  status?: number;
  constructor(kind: JevErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

/** A Choice question, exactly as the API documents it. */
export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface JevResponse {
  model?: string;
  answers: Record<string, JevChoiceAnswer | Record<string, unknown>>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * The API key, read without assuming a Deno host.
 *
 * This module is imported by the test suite, which runs under Node, and a bare
 * `Deno` there is a compile error in the app's TypeScript program — which is
 * why no other shared module a test imports references the global either.
 */
const apiKey = (): string =>
  (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } })
    .Deno?.env?.get?.("TYPESAFE_API_KEY") ?? "";

export function jevConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * One call, many independent questions. The provider answers each question from
 * the same state, so batching is both cheaper and the documented usage.
 */
export async function askJev(
  state: string,
  questions: Record<string, JevChoiceQuestion>,
): Promise<{ response: JevResponse; latencyMs: number }> {
  // The provider intermittently answers 503 "model_unavailable" or 429. Those
  // are transient, so retry a couple of times with backoff before giving up.
  const delays = [800, 2000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await askJevOnce(state, questions);
    } catch (err) {
      const transient = err instanceof JevError &&
        (err.kind === "rate_limit" || err.kind === "timeout" || (err.status ?? 0) >= 500);
      if (!transient || attempt >= delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

async function askJevOnce(
  state: string,
  questions: Record<string, JevChoiceQuestion>,
): Promise<{ response: JevResponse; latencyMs: number }> {
  const key = apiKey();
  if (!key) throw new JevError("not_configured", "Lead Intelligence is not configured");

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(JEV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state, model: JEV_MODEL, questions }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new JevError(aborted ? "timeout" : "unknown", aborted ? "Evaluation timed out" : String(err));
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const text = await res.text();

  if (!res.ok) {
    const kind: JevErrorKind = res.status === 429 ? "rate_limit" : "http";
    throw new JevError(kind, `Provider returned ${res.status}: ${text.slice(0, 300)}`, res.status);
  }

  let parsed: JevResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JevError("malformed", "Provider returned a response we could not read");
  }
  if (!parsed || typeof parsed !== "object" || !parsed.answers || typeof parsed.answers !== "object") {
    throw new JevError("malformed", "Provider response contained no answers");
  }

  return { response: parsed, latencyMs };
}

/** A Choice answer, or null when the provider omitted/garbled it. */
export function readChoice(
  answers: JevResponse["answers"],
  name: string,
  allowed: string[],
): { choice: string; confidence: number } | null {
  const raw = answers?.[name] as JevChoiceAnswer | undefined;
  if (!raw || typeof raw !== "object") return null;
  const choice = typeof raw.choice === "string" ? raw.choice : null;
  if (!choice || !allowed.includes(choice)) return null;
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.min(Math.max(raw.confidence, 0), 1)
    : 0;
  return { choice, confidence };
}
