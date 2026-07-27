import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
  const data = await response.json();
  return data.choices[0].message.content;
}

const SPAM_TRIGGERS = [
  "free", "guarantee", "winner", "congratulations", "act now", "limited time",
  "click here", "earn money", "make money", "risk free", "special promotion",
  "no obligation", "100%", "$$$", "discount", "cash bonus",
];

function deliverabilityCheck(subject: string, body: string): { ok: boolean; hits: string[] } {
  const text = `${subject} ${body}`.toLowerCase();
  const hits = SPAM_TRIGGERS.filter((w) => text.includes(w));
  return { ok: hits.length === 0, hits };
}

interface Reply {
  sentEmailId: string;
  gmailMessageId: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  gmailThreadId: string;
}

interface AgentConfig {
  id: string;
  enabled: boolean;
  agent_name: string;
  persona: string;
  tone: string;
  company_context: string | null;
  value_props: string[];
  objection_responses: Record<string, string>;
  can_reply_interested: boolean;
  can_handle_objections: boolean;
  can_book_meetings: boolean;
  calendly_url: string | null;
  max_daily_auto_replies: number;
  reply_delay_minutes: number;
  signature: string | null;
  can_find_leads: boolean;
  can_send_outreach: boolean;
  prospecting_job_title: string | null;
  prospecting_industry: string | null;
  prospecting_country: string | null;
  prospecting_company_size: string | null;
  daily_lead_target: number;
  max_daily_new_emails: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const reqBody: { mode?: string } = await req.json().catch(() => ({}));

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agentConfig, error: configError } = await adminClient
      .from("agent_configs")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (configError || !agentConfig) {
      return new Response(
        JSON.stringify({ success: false, message: "Agent is not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = agentConfig as AgentConfig;

    if (!config.enabled) {
      return new Response(
        JSON.stringify({ success: false, message: "Agent is not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { count: dailyReplyCount } = await adminClient
      .from("agent_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action_type", "reply_sent")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const remainingReplies = Math.max(
      0,
      (config.max_daily_auto_replies ?? 0) - (dailyReplyCount ?? 0)
    );

    const { data: integration } = await adminClient
      .from("integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const googleIntegrationId: string | null = integration?.id ?? null;

    const cfgValueProps = Array.isArray(config.value_props) ? config.value_props : [];
    const cfgValuePropsText = cfgValueProps.join("\n");

    // Run mode: "approval" queues drafts for human review, "autonomous" sends directly.
    const approvalMode =
      reqBody.mode === "approval"
        ? true
        : reqBody.mode === "autonomous"
        ? false
        : (agentConfig as any).approval_mode !== false;

    let pendingApprovals = 0;

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    async function queueApproval(row: Record<string, unknown>) {
      const { error } = await adminClient.from("agent_approvals").insert({
        user_id: user.id,
        status: "pending",
        ...row,
      });
      if (error) {
        console.error("queueApproval error:", error.message);
        return false;
      }
      pendingApprovals++;
      return true;
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 1 — Lead generation
    // ────────────────────────────────────────────────────────────────────────
    let leadsFound = 0;
    if (config.can_find_leads) {
      try {
        const target = Math.min(Math.max(config.daily_lead_target ?? 10, 1), 25);
        const searchRes = await fetch(`${supabaseUrl}/functions/v1/fetch-external-leads`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            job_title: config.prospecting_job_title || undefined,
            industry: config.prospecting_industry || undefined,
            country: config.prospecting_country || undefined,
            company_size: config.prospecting_company_size || undefined,
            limit: target,
          }),
        });
        const searchData = await searchRes.json().catch(() => ({}));
        const foundLeads: any[] = Array.isArray(searchData?.leads) ? searchData.leads : [];

        for (const l of foundLeads) {
          const email = (l.business_email || "").trim().toLowerCase();
          if (!email) continue;

          const { data: existingLead } = await adminClient
            .from("leads")
            .select("id")
            .eq("user_id", user.id)
            .ilike("contact_email", email)
            .maybeSingle();
          if (existingLead) continue;

          const { error: insertLeadErr } = await adminClient.from("leads").insert({
            user_id: user.id,
            contact_name: l.contact_name || email.split("@")[0],
            contact_email: email,
            company_name: l.company_name || "Unknown",
            company_website: l.company_domain || null,
            job_title: l.job_title || null,
            industry: l.industry || null,
            company_size: l.company_size || null,
            linkedin_url: l.linkedin_url || null,
            icp_score: l.scores?.icp_score ?? null,
            intent_score: l.scores?.intent_score ?? null,
            signals: Array.isArray(l.buying_signals) ? l.buying_signals : null,
            source: "ai_agent",
            lead_status: "new",
          });
          if (insertLeadErr) continue;

          leadsFound++;
          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            action_type: "lead_found",
            status: "completed",
            prospect_email: email,
            description: `Found ${l.job_title || "contact"} at ${l.company_name || "company"}`,
            metadata: { source: "ai_agent", icp_score: l.scores?.icp_score ?? null },
          });
        }

        if (searchData?.error) {
          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            action_type: "skipped",
            status: "skipped",
            description: `Lead search skipped: ${searchData.error}`,
            metadata: { phase: "prospecting", error_code: searchData.error_code ?? null },
          });
        }
      } catch (prospectErr: any) {
        console.error("agent prospecting error:", prospectErr?.message);
        await adminClient.from("agent_actions").insert({
          user_id: user.id,
          action_type: "error",
          status: "failed",
          description: "Lead generation failed",
          error_message: prospectErr?.message ?? "unknown",
          metadata: { phase: "prospecting" },
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 2 — First-touch outreach
    // ────────────────────────────────────────────────────────────────────────
    let outreachSent = 0;
    if (config.can_send_outreach && googleIntegrationId) {
      try {
        const dailyCap = Math.min(Math.max(config.max_daily_new_emails ?? 20, 0), 100);
        const { count: sentToday } = await adminClient
          .from("agent_actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("action_type", "outreach_sent")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        let remainingOutreach = Math.max(0, dailyCap - (sentToday ?? 0));

        if (remainingOutreach > 0) {
          const { data: pendingLeads } = await adminClient
            .from("leads")
            .select("id, contact_name, contact_email, company_name, job_title, industry, signals")
            .eq("user_id", user.id)
            .not("contact_email", "is", null)
            .is("last_contacted_at", null)
            .order("icp_score", { ascending: false, nullsFirst: false })
            .limit(remainingOutreach);

          for (const lead of pendingLeads ?? []) {
            if (remainingOutreach <= 0) break;
            const to = (lead.contact_email || "").trim();
            if (!to) continue;

            try {
              const { data: alreadySent } = await adminClient
                .from("sent_emails")
                .select("id")
                .eq("user_id", user.id)
                .ilike("to_email", to)
                .limit(1)
                .maybeSingle();
              if (alreadySent) {
                await adminClient
                  .from("leads")
                  .update({ last_contacted_at: new Date().toISOString() })
                  .eq("id", lead.id);
                continue;
              }

              const firstName = (lead.contact_name || "").split(" ")[0] || "there";
              const outreachSystemPrompt = `You are ${config.agent_name ?? "a sales rep"}. Persona: ${config.persona ?? "direct and helpful"}. Tone: ${config.tone ?? "professional"}.
Company context: ${config.company_context ?? ""}
Value propositions:
${cfgValuePropsText}
Never invent metrics, customer names, case studies, or results.`;
              const outreachPrompt = `Write a first-touch cold email to ${firstName}, ${lead.job_title ?? "a decision maker"} at ${lead.company_name ?? "their company"}${lead.industry ? ` (${lead.industry})` : ""}.
${Array.isArray(lead.signals) && lead.signals.length ? `Relevant signals: ${lead.signals.join(", ")}` : ""}

Rules:
- Under 75 words total.
- Greeting line "Hi ${firstName}," then body.
- One clear idea, one low-friction CTA.
- No fabricated stats or claims. No placeholders like [Company].
Return JSON only: { "subject": "...", "body": "..." }`;

              const raw = await callGemini(outreachPrompt, outreachSystemPrompt);
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
                // fall through to validation below
              }
              if (!subject || !body) {
                await adminClient.from("agent_actions").insert({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  metadata: { phase: "outreach", reason: "generation_failed" },
                });
                continue;
              }

              const check = deliverabilityCheck(subject, body);
              if (!check.ok) {
                await adminClient.from("agent_actions").insert({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  subject,
                  metadata: { phase: "outreach", reason: "deliverability_block", spam_triggers: check.hits },
                });
                continue;
              }

              const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                  to,
                  subject,
                  body,
                  integrationRowId: googleIntegrationId,
                  leadId: lead.id,
                }),
              });
              const sendData = await sendRes.json().catch(() => ({}));

              if (!sendRes.ok || sendData?.error) {
                await adminClient.from("agent_actions").insert({
                  user_id: user.id,
                  action_type: "error",
                  status: "failed",
                  prospect_email: to,
                  subject,
                  error_message: sendData?.error ?? `send-email returned ${sendRes.status}`,
                  metadata: { phase: "outreach" },
                });
                continue;
              }

              await adminClient
                .from("leads")
                .update({ last_contacted_at: new Date().toISOString(), lead_status: "contacted" })
                .eq("id", lead.id);

              await adminClient.from("agent_actions").insert({
                user_id: user.id,
                action_type: "outreach_sent",
                status: "completed",
                prospect_email: to,
                subject,
                reply_content: body,
                description: `First-touch email sent to ${lead.company_name ?? to}`,
                metadata: { phase: "outreach", lead_id: lead.id },
              });

              outreachSent++;
              remainingOutreach--;
            } catch (leadErr: any) {
              console.error(`outreach error for ${to}:`, leadErr?.message);
              await adminClient.from("agent_actions").insert({
                user_id: user.id,
                action_type: "error",
                status: "failed",
                prospect_email: to,
                error_message: leadErr?.message ?? "unknown",
                metadata: { phase: "outreach" },
              });
            }
          }
        }
      } catch (outreachErr: any) {
        console.error("agent outreach error:", outreachErr?.message);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 3 — Reply handling
    // ────────────────────────────────────────────────────────────────────────
    const syncRes = await fetch(`${supabaseUrl}/functions/v1/inbox-sync`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!syncRes.ok) {
      const errBody = await syncRes.text();
      throw new Error(`inbox-sync failed: ${errBody}`);
    }

    const syncData = await syncRes.json();

    if (!syncData.success) {
      throw new Error(syncData.error || "inbox-sync returned failure");
    }

    const replies: Reply[] = syncData.replies || [];
    const threadsChecked: number = syncData.threadsChecked ?? 0;

    let repliesProcessed = 0;
    let repliesSent = 0;
    let meetingsBooked = 0;
    let skipped = 0;
    let errors = 0;

    const valuePropsList = Array.isArray(config.value_props) ? config.value_props : [];
    const valuePropsText = valuePropsList.join("\n");

    for (const reply of replies) {
      if (repliesSent >= remainingReplies) break;

      try {
        repliesProcessed++;

        const classifySystemPrompt =
          "You classify sales email replies. Respond ONLY with valid JSON.";
        const classifyPrompt = `Classify this email reply:
Subject: ${reply.subject}
From: ${reply.fromEmail}
Body: ${reply.bodyText}

Classification rules (apply in this order):
1. unsubscribe — asks to stop, remove me, do not contact, hostile "leave me alone".
2. out_of_office / auto_reply — automated away, vacation, or system-generated messages.
3. meeting_request — proposes or agrees to a specific call/meeting/time, asks for a calendar link.
4. objection — ANY hesitation, blocker, deferral or pushback, even if the tone is warm. This includes: "too expensive", "no budget", "not the right time", "already have a solution/vendor", "need to think about it", "need to run it by my team/boss", "circle back later", "not a priority right now", "who is this?" / "how did you get my info?".
5. not_interested — clear rejection with no opening, but no unsubscribe request.
6. interested — positive engagement WITHOUT a blocker: asks for pricing, details, a deck, or says "tell me more" / "sounds interesting, send info".
7. unknown — cannot tell.

Important: a reply that is polite or curious but contains a deferral or condition ("interesting, but I need to think about it", "let me talk to my team first") is objection, NOT interested. Only classify as interested when there is no stated blocker.

Return JSON: { "classification": one of ["interested","objection","meeting_request","not_interested","unsubscribe","out_of_office","auto_reply","unknown"], "confidence": 0.0-1.0, "reasoning": "brief reason" }`;

        const classifyRaw = await callGemini(classifyPrompt, classifySystemPrompt);

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
          // classification stays "unknown"
        }

        if (!reply.bodyText.trim()) {
          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "skipped",
            status: "skipped",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "unknown",
            metadata: { reason: "empty_body", gmail_message_id: reply.gmailMessageId },
          });
          skipped++;
          continue;
        }

        await adminClient
          .from("sent_emails")
          .update({
            replied_at: reply.receivedAt,
            agent_last_synced_at: new Date().toISOString(),
          })
          .eq("id", reply.sentEmailId)
          .is("replied_at", null);

        await adminClient
          .from("sent_emails")
          .update({ agent_last_synced_at: new Date().toISOString() })
          .eq("id", reply.sentEmailId)
          .not("replied_at", "is", null);

        const { data: existingAnalysis } = await adminClient
          .from("reply_analysis")
          .select("id")
          .eq("sent_email_id", reply.sentEmailId)
          .maybeSingle();

        if (existingAnalysis) {
          await adminClient
            .from("reply_analysis")
            .update({
              processed_by_agent: true,
              triage_category: classification,
            })
            .eq("id", existingAnalysis.id);
        } else {
          await adminClient.from("reply_analysis").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            reply_content: reply.bodyText,
            intent_score: confidence,
            intent_classification: classification,
            detected_signals: {
              gmail_message_id: reply.gmailMessageId,
              reasoning,
            },
            requires_human_action: false,
            analyzed_at: new Date().toISOString(),
            processed_by_agent: true,
            triage_category: classification,
          });
        }

        if (classification === "interested" && config.can_reply_interested) {
          const replySystemPrompt = `You are ${config.agent_name}, a sales rep. Your persona: ${config.persona}. Tone: ${config.tone}.
Company context: ${config.company_context ?? ""}
Value propositions: ${valuePropsText}`;

          const replyPrompt = `A prospect replied to your email positively.
Subject: ${reply.subject}
Prospect reply: ${reply.bodyText}

Write a concise ${config.tone} reply (2-3 sentences) that:
- Acknowledges their interest briefly
- Proposes a specific next step (15-minute call or demo)
- Ends with a clear, low-pressure CTA

Output ONLY the reply body. No subject line. No greeting like "Hi [name]". No signature.`;

          const generatedReply = await callGemini(replyPrompt, replySystemPrompt);

          const delivCheck = deliverabilityCheck(`Re: ${reply.subject}`, generatedReply);
          if (!delivCheck.ok) {
            await adminClient.from("agent_actions").insert({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "skipped",
              status: "skipped",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "interested",
              metadata: { reason: "deliverability_block", spam_triggers: delivCheck.hits },
            });
            skipped++;
            continue;
          }

          if (googleIntegrationId) {
            await adminClient.functions.invoke("send-email", {
              body: {
                to: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                body: generatedReply,
                integrationId: googleIntegrationId,
              },
            });
          }

          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "reply_sent",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "interested",
            reply_content: generatedReply,
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "replied" })
            .eq("id", reply.sentEmailId);

          await adminClient
            .from("reply_analysis")
            .update({ agent_reply_sent_at: new Date().toISOString() })
            .eq("sent_email_id", reply.sentEmailId);

          repliesSent++;
        } else if (classification === "objection" && config.can_handle_objections) {
          const objectionGuidance =
            config.objection_responses && Object.keys(config.objection_responses).length > 0
              ? `Prepared guidance for objections: ${JSON.stringify(config.objection_responses)}`
              : "";

          const objectionSystemPrompt = `You are ${config.agent_name}. ${config.persona}. Tone: ${config.tone}.`;
          const objectionPrompt = `The prospect raised an objection to your sales email.
Prospect reply: ${reply.bodyText}
${objectionGuidance}
Write a 2-3 sentence reply that acknowledges their concern, provides a brief value-focused response, and offers a low-commitment next step.
Output ONLY the reply body. No subject line or signature.`;

          const generatedReply = await callGemini(objectionPrompt, objectionSystemPrompt);

          const delivCheck = deliverabilityCheck(`Re: ${reply.subject}`, generatedReply);
          if (!delivCheck.ok) {
            await adminClient.from("agent_actions").insert({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "skipped",
              status: "skipped",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "objection",
              metadata: { reason: "deliverability_block", spam_triggers: delivCheck.hits },
            });
            skipped++;
            continue;
          }

          if (googleIntegrationId) {
            await adminClient.functions.invoke("send-email", {
              body: {
                to: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                body: generatedReply,
                integrationId: googleIntegrationId,
              },
            });
          }

          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "reply_sent",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "objection",
            reply_content: generatedReply,
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "replied" })
            .eq("id", reply.sentEmailId);

          await adminClient
            .from("reply_analysis")
            .update({ agent_reply_sent_at: new Date().toISOString() })
            .eq("sent_email_id", reply.sentEmailId);

          repliesSent++;
        } else if (classification === "meeting_request" && config.can_book_meetings) {
          let meetingReply: string;

          if (config.calendly_url) {
            meetingReply = `Thanks for reaching out! You can book time directly on my calendar here: ${config.calendly_url}. Looking forward to connecting!`;
          } else {
            const meetingSystemPrompt = `You are ${config.agent_name}. ${config.persona}. Tone: ${config.tone}.`;
            const meetingPrompt = `A prospect is requesting a meeting in response to your sales email.
Prospect reply: ${reply.bodyText}
Write a short, friendly reply asking for their availability (2-3 time options format or asking when works best).
Output ONLY the reply body. No subject line or signature.`;
            meetingReply = await callGemini(meetingPrompt, meetingSystemPrompt);
          }

          if (googleIntegrationId) {
            await adminClient.functions.invoke("send-email", {
              body: {
                to: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                body: meetingReply,
                integrationId: googleIntegrationId,
              },
            });
          }

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "meeting_booked" })
            .eq("id", reply.sentEmailId);

          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "meeting_booked",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "meeting_request",
            reply_content: meetingReply,
            metadata: {
              gmail_message_id: reply.gmailMessageId,
              calendly_used: !!config.calendly_url,
              confidence,
            },
          });

          meetingsBooked++;
          repliesSent++;
        } else if (classification === "not_interested") {
          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "closed" })
            .eq("id", reply.sentEmailId);

          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "closed_thread",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "not_interested",
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });
        } else if (classification === "unsubscribe") {
          await adminClient
            .from("email_optouts")
            .upsert(
              { email: reply.fromEmail, opted_out_at: new Date().toISOString() },
              { onConflict: "email" }
            );

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "unsubscribed" })
            .eq("id", reply.sentEmailId);

          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "unsubscribed",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "unsubscribe",
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });
        } else if (
          classification === "out_of_office" ||
          classification === "auto_reply" ||
          classification === "unknown" ||
          (classification === "interested" && !config.can_reply_interested) ||
          (classification === "objection" && !config.can_handle_objections) ||
          (classification === "meeting_request" && !config.can_book_meetings)
        ) {
          const reason =
            classification === "interested" && !config.can_reply_interested
              ? "agent_reply_disabled"
              : classification === "objection" && !config.can_handle_objections
              ? "objection_handling_disabled"
              : classification === "meeting_request" && !config.can_book_meetings
              ? "meeting_booking_disabled"
              : classification;

          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "skipped",
            status: "skipped",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification,
            metadata: { reason, gmail_message_id: reply.gmailMessageId, confidence },
          });

          skipped++;
        }
      } catch (replyErr: any) {
        console.error(`Error processing reply from ${reply.fromEmail}:`, replyErr.message);
        errors++;

        try {
          await adminClient.from("agent_actions").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "error",
            status: "failed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            error_message: replyErr.message,
            metadata: { gmail_message_id: reply.gmailMessageId },
          });
        } catch {
          // Logging failure must not propagate
        }
      }
    }

    await adminClient.from("agent_actions").insert({
      user_id: user.id,
      action_type: "sync",
      status: "completed",
      metadata: {
        threads_checked: threadsChecked,
        leads_found: leadsFound,
        outreach_sent: outreachSent,
        replies_processed: repliesProcessed,
        replies_sent: repliesSent,
        meetings_booked: meetingsBooked,
        skipped,
        errors,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        threadsChecked,
        leadsFound,
        outreachSent,
        repliesProcessed,
        repliesSent,
        meetingsBooked,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("agent-run error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
