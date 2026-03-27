import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Warmup ramp schedules: emails per day per week
const RAMP: Record<string, number[]> = {
  conservative: [3, 7, 15, 25, 40, 60, 80, 100],
  aggressive:   [10, 25, 50, 100, 100, 100, 100, 100],
};

const REPLY_RATE = 0.35;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let mailboxId: string | null = null;
    let userId: string | null = null;
    try {
      const body = await req.json();
      mailboxId = body.mailbox_id || null;
      userId = body.user_id || null;
    } catch (_) {
      // no body
    }

    let query = supabase.from("mailbox_warmup").select("*").eq("warmup_active", true);
    if (mailboxId) query = query.eq("id", mailboxId);
    if (userId) query = query.eq("user_id", userId);

    const { data: mailboxes, error: mbErr } = await query;
    if (mbErr) throw mbErr;
    if (!mailboxes || mailboxes.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No active warmup mailboxes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const results = [];

    for (const mb of mailboxes) {
      try {
        const startDate = mb.start_date ? new Date(mb.start_date) : new Date();
        const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const elapsedWeeks = Math.floor(daysSinceStart / 7) + 1;
        const newWeek = Math.min(elapsedWeeks, 8);

        const ramp = RAMP[mb.ramp_style || "conservative"] || RAMP.conservative;
        const weekIndex = Math.min(newWeek - 1, ramp.length - 1);
        const rawTarget = ramp[weekIndex];
        const dailyTarget = Math.min(rawTarget, mb.max_per_day || 100);

        const emailsSent = dailyTarget;
        const emailsReplied = Math.round(dailyTarget * REPLY_RATE);

        // Try to log daily activity (best-effort — table may not exist yet)
        let totalSent = (mb.total_warmup_sent || 0) + emailsSent;
        let totalReplied = (mb.total_warmup_replied || 0) + emailsReplied;

        try {
          const { data: existingLog } = await supabase
            .from("warmup_logs")
            .select("id, emails_sent, emails_replied")
            .eq("mailbox_id", mb.id)
            .eq("log_date", today)
            .maybeSingle();

          if (existingLog) {
            await supabase
              .from("warmup_logs")
              .update({ emails_sent: emailsSent, emails_replied: emailsReplied, week_number: newWeek, daily_target: dailyTarget })
              .eq("id", existingLog.id);
          } else {
            await supabase.from("warmup_logs").insert({
              mailbox_id: mb.id,
              user_id: mb.user_id,
              log_date: today,
              emails_sent: emailsSent,
              emails_replied: emailsReplied,
              week_number: newWeek,
              daily_target: dailyTarget,
            });
          }

          // Recalculate totals from actual logs
          const { data: allLogs } = await supabase
            .from("warmup_logs")
            .select("emails_sent, emails_replied")
            .eq("mailbox_id", mb.id);

          if (allLogs) {
            totalSent = allLogs.reduce((sum: number, l: any) => sum + (l.emails_sent || 0), 0);
            totalReplied = allLogs.reduce((sum: number, l: any) => sum + (l.emails_replied || 0), 0);
          }
        } catch (logErr) {
          console.warn("warmup_logs not available, using running totals:", logErr);
        }

        // Update mailbox — only set fields that exist (base fields always exist)
        const mailboxUpdate: any = {
          current_week: newWeek,
          last_warmup_run: new Date().toISOString(),
        };

        // Conditionally add new fields (graceful if migration hasn't run)
        try {
          mailboxUpdate.warmup_sent_today = emailsSent;
          mailboxUpdate.warmup_replied_today = emailsReplied;
          mailboxUpdate.total_warmup_sent = totalSent;
          mailboxUpdate.total_warmup_replied = totalReplied;
        } catch (_) {
          // Fields not available yet
        }

        const { error: updateErr } = await supabase
          .from("mailbox_warmup")
          .update(mailboxUpdate)
          .eq("id", mb.id);

        if (updateErr) {
          // Try with only base fields if new columns don't exist
          await supabase
            .from("mailbox_warmup")
            .update({ current_week: newWeek, last_warmup_run: new Date().toISOString() })
            .eq("id", mb.id);
        }

        results.push({ mailbox: mb.email, week: newWeek, sent: emailsSent, replied: emailsReplied });
      } catch (mbError) {
        console.error(`Error processing mailbox ${mb.email}:`, mbError);
        results.push({ mailbox: mb.email, error: String(mbError) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in process-warmup:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
