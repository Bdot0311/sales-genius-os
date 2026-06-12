import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[WEEKLY-REPORT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    logStep("Function started");
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

    const { data: proUsers, error: usersError } = await supabaseClient.from("subscriptions").select(`user_id, plan, profiles!inner(email, full_name)`).eq("plan", "pro").eq("status", "active");
    if (usersError) throw usersError;

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let reportsSent = 0;

    for (const user of proUsers || []) {
      try {
        const { data: newLeads } = await supabaseClient.from("leads").select("id").eq("user_id", user.user_id).gte("created_at", oneWeekAgo);
        const { data: sentEmails } = await supabaseClient.from("sent_emails").select("id, opened_at, replied_at").eq("user_id", user.user_id).gte("created_at", oneWeekAgo);
        const { data: deals } = await supabaseClient.from("deals").select("id, value").eq("user_id", user.user_id).gte("created_at", oneWeekAgo);
        const { data: positiveReplies } = await supabaseClient.from("reply_analysis").select("id").eq("user_id", user.user_id).eq("intent_classification", "high_intent").gte("analyzed_at", oneWeekAgo);
        const { data: meetingRequests } = await supabaseClient.from("reply_analysis").select("id").eq("user_id", user.user_id).contains("detected_signals", { has_meeting_request: true }).gte("analyzed_at", oneWeekAgo);

        const totalEmails = sentEmails?.length || 0;
        const openRate = totalEmails > 0 ? ((sentEmails!.filter(e => e.opened_at).length / totalEmails) * 100).toFixed(1) : '0';
        const replyRate = totalEmails > 0 ? ((sentEmails!.filter(e => e.replied_at).length / totalEmails) * 100).toFixed(1) : '0';
        const positiveReplyRate = totalEmails > 0 ? (((positiveReplies?.length || 0) / totalEmails) * 100).toFixed(1) : '0';
        const meetingRate = totalEmails > 0 ? (((meetingRequests?.length || 0) / totalEmails) * 100).toFixed(1) : '0';
        const pipelineValue = deals?.reduce((s, d) => s + (d.value || 0), 0) || 0;

        // Color-code positive reply rate against 10% elite benchmark
        const positiveRateNum = parseFloat(positiveReplyRate);
        const positiveRateColor = positiveRateNum >= 10 ? '#10B981' : positiveRateNum >= 5 ? '#F59E0B' : '#EF4444';
        const positiveRateLabel = positiveRateNum >= 10 ? 'ELITE' : positiveRateNum >= 5 ? 'GOOD' : 'NEEDS WORK';

        const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#8B5CF6,#6D28D9);color:white;padding:30px;border-radius:8px 8px 0 0;text-align:center;"><h1>📊 Weekly Report</h1></div>
<div style="background:white;padding:30px;border-radius:0 0 8px 8px;">
<p>Hello ${(user.profiles as any)?.full_name || 'there'},</p>
<p>Here's your weekly performance summary:</p>
<table width="100%" cellpadding="10"><tr>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#8B5CF6;">${newLeads?.length||0}</div><div style="font-size:11px;color:#6b7280;">NEW LEADS</div></td>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#8B5CF6;">${totalEmails}</div><div style="font-size:11px;color:#6b7280;">EMAILS SENT</div></td>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#10B981;">${openRate}%</div><div style="font-size:11px;color:#6b7280;">OPEN RATE</div></td>
</tr></table>
<table width="100%" cellpadding="10" style="margin-top:10px;"><tr>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#10B981;">${replyRate}%</div><div style="font-size:11px;color:#6b7280;">REPLY RATE</div></td>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#10B981;">${deals?.length||0}</div><div style="font-size:11px;color:#6b7280;">NEW DEALS</div></td>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#10B981;">$${pipelineValue.toLocaleString()}</div><div style="font-size:11px;color:#6b7280;">PIPELINE</div></td>
</tr></table>
<table width="100%" cellpadding="10" style="margin-top:10px;"><tr>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:${positiveRateColor};">${positiveReplyRate}%</div><div style="font-size:11px;color:#6b7280;">POSITIVE REPLY RATE</div><div style="font-size:9px;color:${positiveRateColor};font-weight:bold;">${positiveRateLabel} · target: 10%</div></td>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#8B5CF6;">${meetingRequests?.length||0}</div><div style="font-size:11px;color:#6b7280;">MEETING REQUESTS</div><div style="font-size:9px;color:#9CA3AF;">${meetingRate}% of emails sent</div></td>
<td style="text-align:center;background:#f3f4f6;border-radius:8px;"><div style="font-size:28px;font-weight:bold;color:#10B981;">${positiveReplies?.length||0}</div><div style="font-size:11px;color:#6b7280;">HIGH-INTENT REPLIES</div><div style="font-size:9px;color:#9CA3AF;">respond today</div></td>
</tr></table>
<p style="text-align:center;margin-top:30px;"><a href="https://salesos.alephwavex.io/analytics" style="background:#8B5CF6;color:white;padding:12px 30px;text-decoration:none;border-radius:6px;">View Full Analytics →</a></p>
</div></div></body></html>`;

        const messageId = crypto.randomUUID();
        await supabaseClient.rpc('enqueue_email', { queue_name: 'transactional_emails', payload: { message_id: messageId, to: (user.profiles as any).email, from: 'OutReign Reports <noreply@notify.bdotindustries.com>', sender_domain: 'notify.bdotindustries.com', subject: '📊 Your Weekly OutReign Performance Report', html, text: `Weekly Report: ${newLeads?.length||0} leads, ${totalEmails} emails, ${openRate}% open rate`, purpose: 'transactional', label: 'weekly-report', idempotency_key: `weekly-${user.user_id}-${new Date().toISOString().split('T')[0]}`, queued_at: new Date().toISOString() } });
        await supabaseClient.from('email_send_log').insert({ message_id: messageId, template_name: 'weekly-report', recipient_email: (user.profiles as any).email, status: 'pending' });
        reportsSent++;
      } catch (err) { logStep("Error for user", { userId: user.user_id, error: err }); }
    }

    logStep("Done", { sent: reportsSent });
    return new Response(JSON.stringify({ success: true, reportsSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
