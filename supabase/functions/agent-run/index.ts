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

    if ((dailyReplyCount ?? 0) >= config.max_daily_auto_replies) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Daily auto-reply limit of ${config.max_daily_auto_replies} reached`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remainingReplies = config.max_daily_auto_replies - (dailyReplyCount ?? 0);

    const { data: integration } = await adminClient
      .from("integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .single();

    const googleIntegrationId: string | null = integration?.id ?? null;

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
