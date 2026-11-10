// check-copy-risk — what to change in an email before it goes out.
//
// Not a score. A score tells a writer nothing they can act on: 7.2/10 leaves
// them guessing which sentence is the problem. This returns the exact text to
// replace and the exact text to use instead.
//
// Two halves. The link checks are deterministic and run first — shorteners,
// redirect chains, bare IPs, blacklisted destinations and domain age are all
// facts, and no model is needed to establish them. The prose rewrites go to a
// model, because judging whether a sentence reads as marketing is the part that
// actually needs judgment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { AI_SMART, aiFetch } from "../_shared/ai-provider.ts";
import { publicHttpUrl } from "../_shared/safe-url.ts";
import { checkDomainAgainstDnsbls } from "../_shared/dnsbl.ts";
import {
  COPY_RISK_PROMPT_VERSION,
  COPY_RISK_SYSTEM_PROMPT,
  copyRiskUserPayload,
  parseCopyRiskFindings,
} from "../_shared/copy-risk-prompts.ts";
import {
  blacklistFinding,
  domainsToCheck,
  redirectFinding,
  staticLinkFindings,
  type LinkFinding,
} from "../_shared/link-risk.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Follow redirects by hand so the chain itself can be reported. */
async function traceRedirects(url: string, max = 4): Promise<string[]> {
  const hops: string[] = [];
  let current = url;

  for (let i = 0; i < max; i++) {
    if (!publicHttpUrl(current).ok) return hops;
    let res: Response;
    try {
      res = await fetch(current, { method: "HEAD", redirect: "manual" });
    } catch {
      // A link we cannot reach is not evidence of a redirect chain. Silence is
      // the honest answer, not a fabricated hop.
      return hops;
    }
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get("location");
    if (!next) break;
    try {
      current = new URL(next, current).toString();
    } catch {
      break;
    }
    hops.push(new URL(current).hostname);
  }

  return hops;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const subject = typeof body.subject === "string" ? body.subject : "";
    const emailBody = typeof body.body === "string" ? body.body : "";
    const firstTouch = body.firstTouch !== false;
    if (!emailBody.trim()) return json({ error: "email body is required" }, 400);

    const source = `${subject}\n${emailBody}`;

    // ---- Links: facts, established without a model ----
    const linkFindings: LinkFinding[] = staticLinkFindings(emailBody, firstTouch);

    const domains = domainsToCheck(emailBody);
    // Bounded: a body with twenty links should not turn into twenty DNS
    // round-trips while the writer waits.
    for (const domain of domains.slice(0, 5)) {
      try {
        const result = await checkDomainAgainstDnsbls(domain);
        const listed = (result ?? []).filter((r) => r.listed).map((r) => r.rbl_name);
        const finding = blacklistFinding(domain, listed);
        if (finding) linkFindings.push(finding);
      } catch (e) {
        console.warn(`[check-copy-risk] blacklist lookup failed for ${domain}:`, e);
      }
    }

    const uniqueLinks: string[] = [
      ...new Set<string>(emailBody.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []),
    ].slice(0, 3);
    for (const link of uniqueLinks) {
      const hops = await traceRedirects(link.replace(/[.,;:!?]+$/, ""));
      const finding = redirectFinding(link, hops);
      if (finding) linkFindings.push(finding);
    }

    // ---- Prose: the part that needs judgment ----
    let copyFindings: ReturnType<typeof parseCopyRiskFindings>["findings"] = [];
    let summary = "";
    let copyAvailable = true;

    const res = await aiFetch("check-copy-risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_SMART,
        temperature: 0,
        messages: [
          { role: "system", content: COPY_RISK_SYSTEM_PROMPT },
          { role: "user", content: copyRiskUserPayload(subject, emailBody, firstTouch) },
        ],
      }),
    }, { fn: "check-copy-risk", userId: user.id });

    if (!res.ok) {
      // The link findings are still real. Returning them with an honest note
      // beats failing the whole request because one half was unavailable.
      copyAvailable = false;
      console.error(`[check-copy-risk] model call failed: ${res.status}`);
    } else {
      const payload = await res.json().catch(() => null);
      const text = payload?.choices?.[0]?.message?.content ?? "";
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      } catch {
        parsed = null;
      }
      if (parsed) {
        const result = parseCopyRiskFindings(parsed, source);
        copyFindings = result.findings;
        summary = typeof (parsed as { summary?: unknown }).summary === "string"
          ? (parsed as { summary: string }).summary
          : "";
        if (result.dropped > 0) {
          // A finding quoting text that is not in the email would send the
          // writer looking for something that does not exist.
          console.warn(`[check-copy-risk] dropped ${result.dropped} unverifiable finding(s)`);
        }
      } else {
        copyAvailable = false;
        console.error("[check-copy-risk] model returned unparseable output");
      }
    }

    const critical = [...linkFindings, ...copyFindings].filter((f) => f.severity === "critical").length;

    return json({
      promptVersion: COPY_RISK_PROMPT_VERSION,
      linkFindings,
      copyFindings,
      copyAvailable,
      summary: copyAvailable
        ? summary
        : "Link checks completed. The copy review could not run — the findings below cover links only.",
      counts: {
        total: linkFindings.length + copyFindings.length,
        critical,
      },
    });
  } catch (err) {
    console.error("[check-copy-risk] error:", err);
    return json({ error: "Could not review this email right now." }, 500);
  }
});
