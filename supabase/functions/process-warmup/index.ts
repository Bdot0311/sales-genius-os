import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Warmup ramp schedules: emails per day per week
const RAMP = {
  conservative: [3, 7, 15, 25, 40, 60, 80, 100],
  aggressive:   [10, 25, 50, 100, 100, 100, 100, 100],
};

const REPLY_RATE = 0.35; // 35% simulated reply rate from warmup pool

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional mailbox_id from body (to run for a single mailbox)
    let mailboxId: string | null = null;
    let userId: string | null = null;
    try {
      const body = await req.json();
      mailboxId = body.mailbox_id || null;
      userId = body.user_id || null;
    } catch (_) {
      // no body is fine
    }

    // Build query
    let query = supabase
      .from("mailbox_warmup")
      .select("*")
      .eq("warmup_active", true);

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
        // Calculate elapsed weeks since start_date
        const startDate = mb.start_date ? new Date(mb.start_date) : new Date();
        const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const elapsedWeeks = Math.floor(daysSinceStart / 7) + 1;
        const newWeek = Math.min(elapsedWeeks, 8);

        // Get ramp schedule
        const ramp = RAMP[(mb.ramp_style as keyof typeof RAMP) || "conservative"];
        const weekIndex = Math.min(newWeek - 1, ramp.length - 1);
        const rawTarget = ramp[weekIndex];
        const dailyTarget = Math.min(rawTarget, mb.max_per_day || 100);

        // Check if we already ran today for this mailbox
        const { data: existingLog } = await supabase
          .from("warmup_logs")
          .select("id, emails_sent")
          .eq("mailbox_id", mb.id)
          .eq("log_date", today)
          .maybeSingle();

        let emailsSent = dailyTarget;
        let emailsReplied = Math.round(dailyTarget * REPLY_RATE);

        if (existingLog) {
          // Already ran today — update with latest numbers (idempotent)
          await supabase
            .from("warmup_logs")
            .update({ emails_sent: emailsSent, emails_replied: emailsReplied, week_number: newWeek, daily_target: dailyTarget })
            .eq("id", existingLog.id);
        } else {
          // Insert today's log
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

        // Recalculate total stats from all logs
        const { data: allLogs } = await supabase
          .from("warmup_logs")
          .select("emails_sent, emails_replied")
          .eq("mailbox_id", mb.id);

        const totalSent = (allLogs || []).reduce((sum, l) => sum + (l.emails_sent || 0), 0);
        const totalReplied = (allLogs || []).reduce((sum, l) => sum + (l.emails_replied || 0), 0);

        // Update mailbox record
        await supabase
          .from("mailbox_warmup")
          .update({
            current_week: newWeek,
            warmup_sent_today: emailsSent,
            warmup_replied_today: emailsReplied,
            total_warmup_sent: totalSent,
            total_warmup_replied: totalReplied,
            last_warmup_run: new Date().toISOString(),
          })
          .eq("id", mb.id);

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
