import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiFetch } from "../_shared/ai-provider.ts";
import { deliverabilityCheck } from "../_shared/email-deliverability.ts";
import {
  AGENT_SCENARIOS,
  explainResult,
  scoreScenario,
} from "../_shared/agent-scenarios.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const response = await aiFetch("agent-test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI gateway ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}


interface Scenario {
  id: string;
  label: string;
  category: string;
  expected: string[];
  subject: string;
  body: string;
}

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: "too_expensive",
    label: "Objection — too expensive",
    category: "objection",
    expected: ["objection"],
    subject: "Re: Quick question",
    body: "Thanks for reaching out but honestly this looks way too expensive for us. We can't justify that kind of spend right now.",
  },
  {
    id: "not_right_time",
    label: "Objection — not the right time",
    category: "objection",
    expected: ["objection", "not_interested"],
    subject: "Re: Quick question",
    body: "Appreciate the note. It's just not the right time for us — maybe revisit next quarter.",
  },
  {
    id: "have_solution",
    label: "Objection — already have a solution",
    category: "objection",
    expected: ["objection", "not_interested"],
    subject: "Re: Quick question",
    body: "We already use another vendor for this and we're pretty happy with them.",
  },
  {
    id: "need_to_think",
    label: "Objection — need to think about it",
    category: "objection",
    expected: ["objection"],
    subject: "Re: Quick question",
    body: "Interesting, but I need to think about it and talk to my team before doing anything.",
  },
  {
    id: "interested",
    label: "Positive — interested",
    category: "control",
    expected: ["interested", "meeting_request"],
    subject: "Re: Quick question",
    body: "This sounds good, tell me more. How does it work?",
  },
  {
    id: "meeting_request",
    label: "Positive — meeting request",
    category: "control",
    expected: ["meeting_request", "interested"],
    subject: "Re: Quick question",
    body: "Can we set up 15 minutes Thursday afternoon? Send over a calendar invite.",
  },
  {
    id: "out_of_office",
    label: "Edge case — out of office",
    category: "edge",
    expected: ["out_of_office", "auto_reply"],
    subject: "Automatic reply: Quick question",
    body: "I am currently out of the office until the 14th with limited access to email. For urgent matters contact ops@example.com.",
  },
  {
    id: "who_is_this",
    label: "Edge case — who is this?",
    category: "edge",
    expected: ["unknown", "objection", "interested"],
    subject: "Re: Quick question",
    body: "Who is this? I don't remember signing up for anything or ever speaking with you.",
  },
  {
    id: "hostile",
    label: "Edge case — hostile reply",
    category: "edge",
    expected: ["not_interested", "unsubscribe"],
    subject: "Re: Quick question",
    body: "This is spam and you people are a joke. Stop wasting my time with this garbage.",
  },
  {
    id: "unsubscribe",
    label: "Edge case — unsubscribe request",
    category: "edge",
    expected: ["unsubscribe", "not_interested"],
    subject: "Re: Quick question",
    body: "Please remove me from your list and do not contact me again.",
  },
];

/**
 * Run the behavioural scenarios against the live agent.
 *
 * The classification eval below scores how replies are read. This scores what
 * the agent DOES — which tools it reached for, which it left alone, and what it
 * said — because "it did something I didn't ask for" is a different failure
 * from "it read that reply wrong", and only one of them had a test.
 *
 * Each scenario is one real agent-chat turn on its own thread, so scenarios
 * cannot contaminate each other through history.
 */
async function runScenarios(
  supabaseUrl: string,
  authHeader: string,
  anonKey: string,
  admin: any,
  userId: string,
  // A full agent turn is slow, and eight of them do not fit inside one
  // function invocation. The caller may ask for a subset and stitch the
  // results together.
  onlyIds?: string[],
): Promise<{ passed: number; failed: number; results: unknown[] }> {
  const results: unknown[] = [];
  let passed = 0;
  let failed = 0;

  const selected = onlyIds && onlyIds.length > 0
    ? AGENT_SCENARIOS.filter((s) => onlyIds.includes(s.id))
    : AGENT_SCENARIOS;

  // Two scenarios name "Acme Corp". Without a record by that name the agent
  // correctly does nothing, and the eval would score a right answer as a miss.
  // The fixture is seeded per run and removed afterwards.
  const needsFixture = selected.some((s) => /Acme Corp/i.test(s.message));
  let fixtureLeadId: string | null = null;
  if (needsFixture) {
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .insert({
        user_id: userId,
        company_name: "Acme Corp",
        contact_name: "Dana Reeves",
        job_title: "VP Operations",
        contact_email: "dana.reeves@acme-eval.example",
        company_website: "https://acme-eval.example",
        industry: "Logistics",
        lead_status: "active",
        pipeline_stage: "new",
        demo_seed: true,
      })
      .select("id")
      .maybeSingle();
    if (leadErr) {
      return {
        passed: 0,
        failed: selected.length,
        results: selected.map((s) => ({
          id: s.id,
          passed: false,
          error: `could not seed eval fixture: ${leadErr.message}`,
          guards: s.guards,
        })),
      };
    }
    fixtureLeadId = (lead as { id: string } | null)?.id ?? null;
  }

  for (const scenario of selected) {

    let calledTools: string[] = [];
    let reply = "";
    let error: string | null = null;
    let configId: string | null = null;
    let threadId: string | null = null;

    try {
      // A scenario needs a real agent build and a real thread: agent-chat is
      // the thing under test, so it runs against live records, not a stub.
      const { data: cfg, error: cfgErr } = await admin
        .from("agent_configs")
        .insert({
          user_id: userId,
          agent_name: `Eval — ${scenario.id}`,
          role: scenario.role,
          allowed_tools: scenario.allowedTools ?? null,
          is_primary: false,
          enabled: false,
          approval_mode: scenario.mode === "approval",
        })
        .select("id")
        .single();
      if (cfgErr) throw new Error(`could not create eval agent: ${cfgErr.message}`);
      configId = (cfg as { id: string }).id;

      const { data: thread, error: threadErr } = await admin
        .from("agent_chat_threads")
        .insert({
          user_id: userId,
          title: `Behaviour eval — ${scenario.id}`,
          autonomy: scenario.mode === "autonomous" ? "autonomous" : "approval",
          agent_config_id: configId,
        })
        .select("id")
        .single();
      if (threadErr) throw new Error(`could not create eval thread: ${threadErr.message}`);
      // A fresh thread per scenario: shared history would let one scenario's
      // work satisfy the next one's expectations.
      threadId = (thread as { id: string }).id;

      // Priming turns run on the same thread and are not scored. They put the
      // agent in the state the real failures happened in: reasoning from its
      // own earlier account of what it did.
      for (const priming of scenario.priorTurns ?? []) {
        await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({
            message: priming,
            threadId,
            agentId: configId,
            evalScenario: `${scenario.id}:priming`,
          }),
        }).catch(() => undefined);
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: anonKey,
        },
        body: JSON.stringify({
          message: scenario.message,
          threadId,
          agentId: configId,
          evalScenario: scenario.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      calledTools = Array.isArray(data?.toolEvents)
        ? data.toolEvents.map((e: { name?: string }) => e?.name ?? "").filter(Boolean)
        : [];
      reply = String(data?.message?.content ?? data?.reply ?? data?.content ?? "");
      if (!res.ok || data?.error) {
        error = data?.error
          ? `agent-chat: ${String(data.error)}`
          : `agent-chat returned ${res.status}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "agent-chat did not respond";
    } finally {
      // Eval records are scaffolding, not user data — they do not survive the run.
      if (threadId) {
        await admin.from("agent_chat_messages").delete().eq("thread_id", threadId);
        await admin.from("agent_chat_threads").delete().eq("id", threadId);
      }
      if (configId) await admin.from("agent_configs").delete().eq("id", configId);
    }

    if (error) {
      // A scenario that could not run is not a scenario that passed.
      failed++;
      results.push({ id: scenario.id, passed: false, error, guards: scenario.guards });
      continue;
    }

    const result = scoreScenario(scenario, calledTools, reply);
    if (result.passed) passed++;
    else failed++;
    results.push({ ...result, guards: scenario.guards, explanation: explainResult(scenario, result) });
  }

  if (fixtureLeadId) {
    await admin.from("leads").delete().eq("id", fixtureLeadId).eq("user_id", userId);
  }

  return { passed, failed, results };
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: {
      mode?: "dry_run" | "live_send" | "live_check" | "list_mailboxes" | "behaviour";
      scenarioIds?: string[];
      testEmail?: string;
      integrationRowId?: string;
      includeRealReplies?: boolean;
      customReplies?: { label?: string; body?: string; subject?: string }[];
      agentId?: string;
    } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    // Test the agent build the caller picked in the switcher; fall back to the
    // primary build when none is named.
    let configQuery = adminClient.from("agent_configs").select("*").eq("user_id", user.id);
    if (typeof payload.agentId === "string" && payload.agentId) {
      configQuery = configQuery.eq("id", payload.agentId);
    }
    const { data: config } = await configQuery
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No agent configuration found. Save your agent config before testing.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfgValueProps = Array.isArray(config.value_props) ? config.value_props : [];
    const cfgValuePropsText = cfgValueProps.join("\n");
    const mode = payload.mode ?? "dry_run";
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Behavioural eval: what the agent DOES, not how it reads a reply.
    if (mode === "behaviour") {
      const { passed, failed, results } = await runScenarios(
        Deno.env.get("SUPABASE_URL")!,
        authHeader,
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        adminClient,
        user.id,
        Array.isArray(payload.scenarioIds) ? payload.scenarioIds.map(String) : undefined,
      );

      return new Response(
        JSON.stringify({
          success: true,
          mode: "behaviour",
          passed,
          failed,
          total: passed + failed,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "list_mailboxes") {
      const { data: accounts, error: accountsError } = await adminClient
        .from("sending_accounts")
        .select("id, integration_id, email, provider, status, paused_reason, warmup_enabled, updated_at, created_at")
        .eq("user_id", user.id)
        .in("provider", ["google", "gmail"])
        .not("integration_id", "is", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (accountsError) {
        return new Response(
          JSON.stringify({ success: false, error: accountsError.message, mailboxes: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const seen = new Set<string>();
      const mailboxes = (accounts ?? [])
        .filter((account) => account.integration_id && account.email)
        .filter((account) => {
          const key = account.integration_id as string;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((account) => ({
          sendingAccountId: account.id,
          integrationId: account.integration_id,
          email: account.email,
          provider: account.provider,
          status: account.status ?? "active",
          pausedReason: account.paused_reason ?? null,
          warmupEnabled: Boolean(account.warmup_enabled),
        }));

      return new Response(
        JSON.stringify({ success: true, mode, mailboxes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve the Gmail integration used for live sending / inbox reads.
    // Prefer an active sending account so the test doesn't fail just because
    // the most recently reconnected mailbox is paused while another Gmail
    // mailbox is available.
    const resolveIntegration = async (): Promise<{
      integrationRowId: string | null;
      pausedAccountId: string | null;
      pausedReason: string | null;
    }> => {
      if (payload.integrationRowId) {
        const { data: account } = await adminClient
          .from("sending_accounts")
          .select("id, status, paused_reason")
          .eq("user_id", user.id)
          .eq("integration_id", payload.integrationRowId)
          .maybeSingle();

        return {
          integrationRowId: payload.integrationRowId,
          pausedAccountId: account?.status === "paused" || account?.status === "disabled" ? account.id : null,
          pausedReason: account?.status === "paused" || account?.status === "disabled" ? account.paused_reason : null,
        };
      }

      const { data: accounts } = await adminClient
        .from("sending_accounts")
        .select("id, integration_id, status, paused_reason, updated_at")
        .eq("user_id", user.id)
        .in("provider", ["google", "gmail"])
        .not("integration_id", "is", null)
        .order("updated_at", { ascending: false });

      const activeAccount = (accounts ?? []).find(
        (account) => account.integration_id && account.status !== "paused" && account.status !== "disabled"
      );
      if (activeAccount?.integration_id) {
        return { integrationRowId: activeAccount.integration_id, pausedAccountId: null, pausedReason: null };
      }

      const pausedAccount = (accounts ?? []).find((account) => account.integration_id);
      if (pausedAccount?.integration_id) {
        return {
          integrationRowId: pausedAccount.integration_id,
          pausedAccountId: pausedAccount.id,
          pausedReason: pausedAccount.paused_reason ?? null,
        };
      }

      const { data } = await adminClient
        .from("integrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("integration_id", "google")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { integrationRowId: data?.id ?? null, pausedAccountId: null, pausedReason: null };
    };

    // ── LIVE SEND: send a real first-touch email to the user's own burner inbox
    if (mode === "live_send") {
      const to = (payload.testEmail ?? "").trim();
      if (!EMAIL_RE.test(to)) {
        return new Response(
          JSON.stringify({ success: false, error: "Enter a valid burner email address to test with." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { integrationRowId, pausedAccountId, pausedReason } = await resolveIntegration();
      if (!integrationRowId) {
        return new Response(
          JSON.stringify({ success: false, error: "No active Gmail connection found. Connect Gmail first." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pausedAccountId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: pausedReason
              ? `Every connected sending mailbox is paused. Last pause reason: ${pausedReason}`
              : "Every connected sending mailbox is paused. Resume one from Deliverability, then retry.",
            code: "account_paused",
            sendingAccountId: pausedAccountId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const firstName = to.split("@")[0].replace(/[._-]+/g, " ").split(" ")[0] || "there";
      const systemPrompt = `You are ${config.agent_name ?? "a sales rep"}. Persona: ${config.persona ?? "direct and helpful"}. Tone: ${config.tone ?? "professional"}.
Company context: ${config.company_context ?? ""}
Value propositions:
${cfgValuePropsText}
Never invent metrics, customer names, case studies, or results.`;
      const prompt = `Write a first-touch cold email to ${firstName}.

Rules:
- Under 75 words total.
- Greeting line "Hi ${firstName}," then body.
- One clear idea, one low-friction CTA.
- No fabricated stats or claims. No placeholders like [Company].
Return JSON only: { "subject": "...", "body": "..." }`;

      const raw = await callGemini(prompt, systemPrompt);
      let subject = "";
      let body = "";
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]);
          subject = (parsed.subject ?? "").toString().trim();
          body = (parsed.body ?? "").toString().trim();
        }
      } catch {
        // handled below
      }
      if (!subject || !body) {
        return new Response(
          JSON.stringify({ success: false, error: "The agent failed to generate an email from your configuration." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const check = deliverabilityCheck(subject, body);

      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body, integrationRowId }),
      });
      const sendData = await sendRes.json().catch(() => ({}));

      if (!sendRes.ok || sendData?.error) {
        let sendingAccountId: string | null = null;
        if (sendData?.code === "account_paused") {
          const { data: sa } = await adminClient
            .from("sending_accounts")
            .select("id")
            .eq("user_id", user.id)
            .eq("integration_id", integrationRowId)
            .limit(1)
            .maybeSingle();
          sendingAccountId = sa?.id ?? null;
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: sendData?.error ?? `send-email returned ${sendRes.status}`,
            code: sendData?.code ?? null,
            sendingAccountId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }


      await adminClient.from("agent_actions").insert({
        user_id: user.id,
        action_type: "outreach_sent",
        status: "completed",
        prospect_email: to,
        subject,
        reply_content: body,
        description: `Live test email sent to ${to}`,
        metadata: { phase: "live_test" },
      });

      return new Response(
        JSON.stringify({
          success: true,
          mode: "live_send",
          to,
          subject,
          body,
          messageId: sendData?.messageId ?? null,
          threadId: sendData?.threadId ?? null,
          spam_triggers: check.hits,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scenarios: Scenario[] = mode === "live_check" ? [] : [...DEFAULT_SCENARIOS];

    // Pull REAL inbound replies from the connected mailbox so the test runs
    // against actual email traffic, not only synthetic scenarios.
    let syncError: string | null = null;
    if (mode === "live_check" || payload.includeRealReplies) {
      try {
        const syncRes = await fetch(`${supabaseUrl}/functions/v1/inbox-sync`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            testEmail: payload.testEmail,
            includeOwnReplies: mode === "live_check",
          }),
        });
        const syncData = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok || !syncData?.success) {
          syncError = syncData?.error ?? `inbox-sync returned ${syncRes.status}`;
        } else {
          const filterTo = (payload.testEmail ?? "").trim().toLowerCase();
          const realReplies = (syncData.replies ?? []).filter((r: any) =>
            filterTo ? (r.fromEmail ?? "").toLowerCase() === filterTo : true
          );
          for (const [i, r] of realReplies.entries()) {
            if (!(r.bodyText ?? "").trim()) continue;
            scenarios.push({
              id: `real_${i}`,
              label: `Real reply from ${r.fromEmail ?? "unknown"}`,
              category: "real",
              expected: [],
              subject: r.subject ?? "(no subject)",
              body: r.bodyText,
            });
          }
        }
      } catch (e) {
        syncError = e instanceof Error ? e.message : "inbox-sync failed";
      }
    }

    for (const [i, custom] of (payload.customReplies ?? []).entries()) {
      if (!custom?.body?.trim()) continue;
      scenarios.push({
        id: `custom_${i}`,
        label: custom.label?.trim() || `Custom reply ${i + 1}`,
        category: "custom",
        expected: [],
        subject: custom.subject?.trim() || "Re: Quick question",
        body: custom.body,
      });
    }

    if (scenarios.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            syncError ??
            "No replies found yet from that address. Reply from your burner inbox, then check again.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const valuePropsList = Array.isArray(config.value_props) ? config.value_props : [];
    const valuePropsText = valuePropsList.join("\n");
    const objectionResponses = (config.objection_responses ?? {}) as Record<string, string>;

    const results: unknown[] = [];

    for (const scenario of scenarios) {
      try {
        const classifyRaw = await callGemini(
          `Classify this email reply:
Subject: ${scenario.subject}
From: test-prospect@example.com
Body: ${scenario.body}

Classification rules (apply in this order):
1. unsubscribe — asks to stop, remove me, do not contact, hostile "leave me alone".
2. out_of_office / auto_reply — automated away, vacation, or system-generated messages.
3. meeting_request — proposes or agrees to a specific call/meeting/time, asks for a calendar link.
4. objection — ANY hesitation, blocker, deferral or pushback, even if the tone is warm. This includes: "too expensive", "no budget", "not the right time", "already have a solution/vendor", "need to think about it", "need to run it by my team/boss", "circle back later", "not a priority right now", "who is this?" / "how did you get my info?".
5. not_interested — clear rejection with no opening, but no unsubscribe request.
6. interested — positive engagement WITHOUT a blocker: asks for pricing, details, a deck, or says "tell me more" / "sounds interesting, send info".
7. unknown — cannot tell.

Important: a reply that is polite or curious but contains a deferral or condition ("interesting, but I need to think about it", "let me talk to my team first") is objection, NOT interested. Only classify as interested when there is no stated blocker.

Return JSON: { "classification": one of ["interested","objection","meeting_request","not_interested","unsubscribe","out_of_office","auto_reply","unknown"], "confidence": 0.0-1.0, "reasoning": "brief reason" }`,
          "You classify sales email replies. Respond ONLY with valid JSON."
        );

        let classification = "unknown";
        let confidence = 0;
        let reasoning = "";
        try {
          const jsonMatch = classifyRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            classification = parsed.classification ?? "unknown";
            confidence = parsed.confidence ?? 0;
            reasoning = parsed.reasoning ?? "";
          }
        } catch {
          // keep defaults
        }

        // Mirror agent-run routing logic without sending anything.
        let action = "logged_for_review";
        let draft: string | null = null;
        let deliverability: { ok: boolean; hits: string[] } | null = null;

        if (classification === "interested" && config.can_reply_interested) {
          action = "would_send_reply";
          draft = await callGemini(
            `A prospect replied to your email positively.
Subject: ${scenario.subject}
Prospect reply: ${scenario.body}

Write a concise ${config.tone} reply (2-3 sentences) that acknowledges their interest, proposes a 15-minute call, and ends with a low-pressure CTA.
Output ONLY the reply body. No subject line. No greeting. No signature.`,
            `You are ${config.agent_name}, a sales rep. Your persona: ${config.persona}. Tone: ${config.tone}.
Company context: ${config.company_context ?? ""}
Value propositions: ${valuePropsText}`
          );
        } else if (classification === "objection" && config.can_handle_objections) {
          action = "would_send_reply";
          const configured = Object.entries(objectionResponses)
            .filter(([, v]) => (v ?? "").trim())
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n");
          draft = await callGemini(
            `A prospect raised an objection.
Subject: ${scenario.subject}
Prospect reply: ${scenario.body}

Configured objection responses:
${configured || "(none configured)"}

Write a concise ${config.tone} reply (2-3 sentences) that addresses the objection honestly and offers a light next step.
Output ONLY the reply body. No subject line. No greeting. No signature.`,
            `You are ${config.agent_name}, a sales rep. Your persona: ${config.persona}. Tone: ${config.tone}.
Company context: ${config.company_context ?? ""}
Value propositions: ${valuePropsText}`
          );
        } else if (classification === "meeting_request" && config.can_book_meetings) {
          action = "would_send_booking_link";
          draft = config.calendly_url
            ? `Would share booking link: ${config.calendly_url}`
            : "No booking link configured — the agent would fall back to human review.";
        } else if (classification === "unsubscribe") {
          action = "would_suppress_contact";
        } else if (classification === "not_interested") {
          action = "would_close_thread";
        } else if (classification === "out_of_office" || classification === "auto_reply") {
          action = "would_skip_no_reply";
        } else if (
          (classification === "interested" && !config.can_reply_interested) ||
          (classification === "objection" && !config.can_handle_objections) ||
          (classification === "meeting_request" && !config.can_book_meetings)
        ) {
          action = "capability_disabled_human_review";
        }

        if (draft && action === "would_send_reply") {
          deliverability = deliverabilityCheck(`Re: ${scenario.subject}`, draft);
          if (!deliverability.ok) action = "would_block_spam_triggers";
        }

        results.push({
          id: scenario.id,
          label: scenario.label,
          category: scenario.category,
          subject: scenario.subject,
          body: scenario.body,
          expected: scenario.expected,
          classification,
          confidence,
          reasoning,
          pass: scenario.expected.length === 0 ? null : scenario.expected.includes(classification),
          action,
          draft,
          spam_triggers: deliverability?.hits ?? [],
        });
      } catch (e) {
        results.push({
          id: scenario.id,
          label: scenario.label,
          category: scenario.category,
          subject: scenario.subject,
          body: scenario.body,
          expected: scenario.expected,
          classification: "error",
          confidence: 0,
          reasoning: e instanceof Error ? e.message : "Unknown error",
          pass: false,
          action: "error",
          draft: null,
          spam_triggers: [],
        });
      }
    }

    const graded = results.filter((r) => (r as { pass: boolean | null }).pass !== null);
    const passed = graded.filter((r) => (r as { pass: boolean }).pass).length;

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        syncError,
        realReplies: results.filter((r) => (r as { category: string }).category === "real").length,
        dryRun: true,

        total: results.length,
        graded: graded.length,
        passed,
        failed: graded.length - passed,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
