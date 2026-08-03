import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  extractJsonObject,
  isEmptyIcp,
  normalizeIcp,
  type ParsedIcp,
} from "../_shared/icp-parse.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_QUERY_LENGTH = 2_000;

// The model reads the sentence; it does not decide the vocabulary. Values are
// snapped to what the pipeline understands afterwards, in code — see
// _shared/icp-parse.ts. The prompt still names the size buckets and seniority
// levels because a model that emits them directly needs no coercion, and it is
// told not to guess because an invented filter silently changes the result set
// the user is judging.
const SYSTEM_PROMPT = `You convert a B2B prospecting description into structured search filters.

Return ONLY a JSON object with these keys:
- jobTitles: string[] — exact job titles to match, e.g. ["VP of Sales", "Head of Growth"]
- seniorities: string[] — one or more of: cxo, vp, director, manager, senior, entry, owner, partner
- industries: string[] — the company's industry, e.g. ["SaaS", "Fintech", "Healthcare"]
- companySizes: string[] — headcount ranges, one or more of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
- locations: string[] — countries, states or cities named in the query
- keywords: string[] — qualifiers that are not any of the above, e.g. ["pre-revenue", "Series A", "remote-first"]
- excludeTitles: string[] — titles the query explicitly rules out
- excludeIndustries: string[] — industries the query explicitly rules out
- excludeKeywords: string[] — anything else the query explicitly rules out

Rules:
1. Extract only what the description states or directly implies. Never add a filter the user did not ask for. If the query names no industry, return an empty industries array — do not guess a likely one.
2. Put a value in exactly one field. A role goes in jobTitles, not keywords.
3. "founder", "co-founder" and "owner" are job titles, and also imply seniority "owner".
4. Map a stated headcount to the closest listed bucket. "a team of 1-10" is "1-10".
5. Only populate the exclude* fields when the query uses explicit negative wording ("not", "excluding", "no", "other than").
6. Omit a key entirely rather than inventing a placeholder like "any" or "none".

Return the JSON object and nothing else.`;

interface GatewayFailure {
  status: number;
  errorCode: string;
  message: string;
}

/** One call to the model, with a hard timeout so a hung gateway cannot hang the search. */
async function callGateway(apiKey: string, query: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        // The same description must always produce the same filters. At the
        // default sampling temperature it did not, so an identical query could
        // return a different result set on a second run for no visible reason.
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

function failure(status: number, errorCode: string, message: string): GatewayFailure {
  return { status, errorCode, message };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let query: string;
  try {
    const body = await req.json();
    query = typeof body?.query === "string" ? body.query.trim() : "";
  } catch {
    return respond({ error: "Request body must be JSON.", error_code: "bad_request" }, 400);
  }

  if (!query) {
    return respond({ error: "Describe who you are looking for.", error_code: "empty_query" }, 400);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    query = query.slice(0, MAX_QUERY_LENGTH);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("LOVABLE_API_KEY is not configured");
    // No `filters` key on any failure path: the caller falls back to its own
    // parser rather than searching on an ICP that was never read.
    return respond(
      { error: "Query parsing is not configured.", error_code: "parser_unconfigured" },
      503,
    );
  }

  // One retry, and only for faults a second attempt can plausibly fix. Rate
  // limits and payment errors are surfaced immediately.
  let lastFailure: GatewayFailure | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await callGateway(apiKey, query);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      lastFailure = aborted
        ? failure(504, "parser_timeout", "Query parsing timed out.")
        : failure(502, "parser_unreachable", "Could not reach the query parser.");
      console.error(`parse-lead-query attempt ${attempt + 1} failed:`, e);
      continue;
    }

    if (response.status === 429) {
      return respond(
        { error: "Too many searches right now. Try again in a moment.", error_code: "rate_limited" },
        429,
      );
    }
    if (response.status === 402) {
      return respond(
        { error: "AI credits depleted. Please add funds.", error_code: "ai_credits_exhausted" },
        402,
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("AI gateway error:", response.status, detail.slice(0, 500));
      lastFailure = failure(502, "parser_failed", "The query parser rejected this request.");
      // A 4xx other than the two handled above will not change on a retry.
      if (response.status < 500) break;
      continue;
    }

    let content = "";
    try {
      const data = await response.json();
      content = data?.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      console.error("Malformed gateway response:", e);
      lastFailure = failure(502, "parser_failed", "The query parser returned an unreadable response.");
      continue;
    }

    const raw = extractJsonObject(content);
    if (!raw) {
      console.error("Could not extract JSON from model output:", content.slice(0, 500));
      lastFailure = failure(502, "parser_failed", "The query parser returned an unreadable response.");
      continue;
    }

    const icp: ParsedIcp = normalizeIcp(raw);

    if (isEmptyIcp(icp)) {
      // Nothing usable was read. Returning empty arrays here is what let a
      // meaningless ICP reach the search, where an absent filter set used to
      // become a generic job-title search.
      console.warn("Parsed no usable filters from query:", query.slice(0, 200));
      return respond({
        error: "Could not tell who to look for from that description. "
          + 'Name a role and something to narrow it — e.g. "VP of Sales at SaaS companies in the US".',
        error_code: "unparsed_query",
      }, 422);
    }

    console.log("Parsed query:", query.slice(0, 200), "->", JSON.stringify(icp));
    return respond({ filters: icp });
  }

  const f = lastFailure ?? failure(502, "parser_failed", "Query parsing failed.");
  return respond({ error: f.message, error_code: f.errorCode }, f.status);
});
