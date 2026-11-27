// Sequence Generation Engine v2 (Phase 4). Generates a 4-touch cold email
// sequence grounded in a campaign brief and the payoff bank, ranks the hook,
// lints every touch against the style contract (regenerating on failure),
// guards against statistics that are not in the bank, and resolves tokens at
// generation time. Drafts only; no send path. See prompt-v2.ts for the prompt.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { personalizedOutreach } from "../_shared/personalized-outreach.ts";
import { CADENCE } from "../_shared/sequence-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAID = new Set(["starter", "growth", "pro", "agency"]);
const GROWTH_PLUS = new Set(["growth", "pro", "agency"]);

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Rank the most specific hook actually available. Nothing above persona pain
// means the prospect is under-personalized and should be flagged, not papered over.
function selectHook(input: { signal?: string; whyNow?: { claim: string; source?: string }; observation?: string; personaPain?: string; peer?: string }) {
  if (input.signal?.trim()) return { hook: input.signal.trim(), kind: "fired signal", low: false };
  if (input.whyNow?.claim?.trim() && input.whyNow.source) return { hook: `${input.whyNow.claim} (${input.whyNow.source})`, kind: "why-now research", low: false };
  if (input.observation?.trim()) return { hook: input.observation.trim(), kind: "account observation", low: false };
  if (input.peer?.trim()) return { hook: input.peer.trim(), kind: "peer reference", low: false };
  if (input.personaPain?.trim()) return { hook: input.personaPain.trim(), kind: "persona pain", low: true };
  return { hook: "", kind: "none", low: true };
}

/**
 * One touch, written by the generator that will send it.
 *
 * This screen used to preview copy from its own model call. That call shared
 * four modules with generate-email where generate-email imports the whole
 * guard stack -- research, the evidence gates, the grounding retry, the
 * subject rules, the thin-lead fallback -- so every fix to the email writer
 * landed on what gets sent and on none of what the user was shown.
 *
 * The arguments here are the same ones process-sequence-step passes, down to
 * the goal mapping, so the preview is the product rather than a second
 * opinion about it. The user's own token is forwarded, not the service key,
 * so plan and credit rules stay the user's as they are from Studio.
 */
async function touchFromSender(input: {
  authHeader: string;
  leadId: string;
  senderName: string;
  senderCompany: string;
  businessDescription: string;
  touchNumber: number;
  touchCount: number;
  payoffBank: unknown[];
}): Promise<{ subject: string; body: string }> {
  return personalizedOutreach(async (payload) => {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-email`, {
      method: "POST",
      headers: { Authorization: input.authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(150_000),
    });
    return { data: await response.json(), error: response.ok ? undefined : "Generation failed" };
  }, {
    lead: { id: input.leadId },
    tone: "professional",
    goal: input.touchNumber > 1 ? "4ps_followup" : "introduction",
    senderName: input.senderName,
    senderCompany: input.senderCompany,
    businessDescription: input.businessDescription,
    touchNumber: input.touchNumber,
    touchCount: input.touchCount,
    payoffBank: input.payoffBank,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // Plan: generation is paid; payoff bank + rubric loop are Growth+; Free gets single-touch.
    const { data: adminRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = adminRole?.role === "admin";
    const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
    const plan = (sub?.plan || "free").toLowerCase();
    if (!isAdmin && !PAID.has(plan)) return json({ error: "sequence generation is available on paid plans.", error_code: "upgrade_required" }, 403);
    const growthPlus = isAdmin || GROWTH_PLUS.has(plan);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const lead: any = body.lead ?? {};
    const senderName = String(body.senderName ?? "there").slice(0, 80);

    // Campaign brief (optional) + payoff bank (Growth+ only).
    let brief: any = null;
    if (typeof body.briefId === "string") {
      const { data } = await supabase.from("campaign_briefs").select("*").eq("id", body.briefId).eq("user_id", user.id).maybeSingle();
      brief = data;
    }
    /*
     * Loaded for every plan, matching the sender.
     *
     * This read was behind `if (growthPlus)` while process-sequence-step
     * loads it for everyone, so a Starter account with proof points would
     * have seen a preview written without them and received emails written
     * with them -- a fresh version of the mismatch this change exists to
     * remove. The bank is a constraint on what may be claimed, so it belongs
     * on every plan that has one either way.
     */
    const { data: bankRows } = await supabase.from("payoff_bank")
      .select("id, type, content, source_url, asserts_stat").eq("user_id", user.id);
    const payoffBank: any[] = bankRows || [];

    // Hook selection.
    const hook = selectHook({
      signal: String(body.signal ?? (Array.isArray(lead.signals) ? lead.signals[0] : "") ?? ""),
      whyNow: body.whyNow as any,
      observation: body.observation as string | undefined,
      personaPain: brief?.pain_by_persona?.[lead.job_title] || String(body.personaPain ?? ""),
      peer: body.peer as string | undefined,
    });

    const resolvedTokens: Record<string, string> = {
      first_name: (lead.contact_name || "").split(/\s+/)[0] || "",
      company: lead.company_name || "",
      job_title: lead.job_title || "",
      sender_first_name: senderName.split(/\s+/)[0],
    };

    // Why-now token: pull the highest-confidence cached claim. Low-confidence
    // claims are never inserted into a token so they can't reach a sent email.
    try {
      if (lead.company_name) {
        const { data: comp } = await supabase.from("companies").select("id").eq("user_id", user.id).eq("name", lead.company_name).maybeSingle();
        if (comp) {
          const { data: wn } = await supabase.from("why_now_research").select("claims").eq("user_id", user.id).eq("company_id", comp.id).maybeSingle();
          const list = Array.isArray(wn?.claims) ? wn.claims : [];
          const pick = list.find((c: any) => c.confidence === "high") || list.find((c: any) => c.confidence === "medium");
          if (pick?.claim) resolvedTokens.why_now = String(pick.claim);
        }
      }
    } catch { /* why_now is an optional token */ }

    // Token resolution guard: if a required token can't be resolved, block and flag.
    const missingTokens = Object.entries(resolvedTokens).filter(([k, v]) => (k === "first_name" || k === "company") && !v).map(([k]) => k);
    if (missingTokens.length) {
      return json({ touches: [], blocked: true, reason: "unresolved_tokens", missing_tokens: missingTokens });
    }

    /*
     * Every touch is written by generate-email, one call per touch, with the
     * same arguments process-sequence-step uses when it actually sends.
     *
     * Touch one runs alone: it is the one that does the research, and the
     * brief is cached per lead, so the rest read it rather than three more
     * passes racing for the same claim.
     *
     * forbiddenClaims is deliberately NOT passed, although this screen has a
     * briefId and could. email_sequences has no brief_id, so the sender
     * cannot load them at send time -- passing them here would put the
     * preview back to showing copy held to a rule the real email is not,
     * which is the exact drift this replaces. They start applying to both
     * when the sequence remembers its brief.
     */
    const { data: profile } = await supabase.from("profiles")
      .select("company_name, business_description").eq("id", user.id).maybeSingle();
    const senderCompany = String(body.senderCompany ?? profile?.company_name ?? "").slice(0, 120);
    const businessDescription = String(profile?.business_description ?? "").slice(0, 2000);
    const cadence = growthPlus ? CADENCE : CADENCE.slice(0, 1);

    const writeTouch = async (step: { day: number; purpose: string }, touchNumber: number) => {
      try {
        const written = await touchFromSender({
          authHeader, leadId: String(lead.id), senderName, senderCompany,
          businessDescription, touchNumber, touchCount: cadence.length, payoffBank,
        });
        return { day: step.day, purpose: step.purpose, subject: written.subject, body: written.body };
      } catch (error) {
        /*
         * A touch the sender would refuse is shown as refused, with its
         * reason. Falling back to copy from anywhere else would put this
         * screen back to showing what will not be sent.
         */
        return {
          day: step.day, purpose: step.purpose, subject: "", body: "", blocked: true,
          reason: error instanceof Error ? error.message : "This touch could not be written.",
        };
      }
    };

    const firstTouch = await writeTouch(cadence[0], 1);
    const laterTouches = cadence.length > 1
      ? await Promise.all(cadence.slice(1).map((step, i) => writeTouch(step, i + 2)))
      : [];
    const touches: any[] = [firstTouch, ...laterTouches];

    if (touches.every((t) => t.blocked)) {
      return json({
        error: String(touches[0]?.reason ?? "The sequence could not be written for this lead."),
        error_code: "sequence_blocked",
        touches: [],
      });
    }

    /*
     * No second scoring pass. personalizedOutreach refuses anything
     * generate-email did not mark `clear`, and generate-email scores against
     * the same rubric -- re-scoring here could reject a touch the sender was
     * happy to send.
     */
    // Growth+: attach the R.E.P.L.Y. rubric to each touch so the user sees scores.
    let rubric: any[] | null = null;
    if (growthPlus && touches.length) {
      rubric = [];
      for (const t of touches) {
        try {
          const { data } = await supabase.functions.invoke("check-email-rubric", { body: { subject: t.subject, body: t.body } });
          rubric.push(data?.dimensions ? { day: t.day, dimensions: data.dimensions, weakest: data.weakest } : null);
        } catch { rubric.push(null); }
      }
    }

    return json({
      touches,
      hook: hook.hook,
      hook_kind: hook.kind,
      low_personalization: hook.low,
      rubric,
    });
  } catch (e) {
    console.error("generate-sequence error", e instanceof Error ? e.message : e);
    return json({ error: "internal error" });
  }
});
