// Weekly SEO digest email to admins via Resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !serviceKey || token !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
  const RESEND = Deno.env.get("RESEND_API_KEY");
  const FROM = "OutReign SEO Monitor <noreply@bdotindustries.com>";

  if (!LOVABLE || !RESEND) return json({ success: false, error: "Email gateway not configured" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Admins
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = (admins || []).map((a: { user_id: string }) => a.user_id);
  if (adminIds.length === 0) return json({ success: true, skipped: "no admins" });

  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", adminIds);
  const recipients = (profiles || []).filter((p: { email: string | null }) => p.email).map((p: { email: string }) => p.email);
  if (recipients.length === 0) return json({ success: true, skipped: "no admin emails" });

  // Issues opened in last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: openIssues } = await supabase
    .from("seo_issues")
    .select("category, severity, title, url, first_seen_at, last_seen_at")
    .is("resolved_at", null)
    .order("severity", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(100);

  const { data: recent } = await supabase
    .from("seo_issues")
    .select("category, severity, title, url, first_seen_at")
    .gte("first_seen_at", since)
    .order("first_seen_at", { ascending: false });

  const { data: runs } = await supabase
    .from("seo_audit_runs")
    .select("kind, status, started_at, pages_checked, issues_found, new_issues, resolved_issues")
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  const newCount = recent?.length || 0;
  const openCount = openIssues?.length || 0;

  const sevColor = (s: string) =>
    s === "critical" ? "#dc2626" : s === "high" ? "#ea580c" : s === "mid" ? "#ca8a04" : "#64748b";

  const issueRow = (i: { category: string; severity: string; title: string; url?: string | null }) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">
        <span style="background:${sevColor(i.severity)};color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;text-transform:uppercase;">${i.severity}</span>
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#0f172a;">
        <div style="font-weight:600;">${i.title}</div>
        ${i.url ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">${i.url}</div>` : ""}
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#64748b;text-transform:uppercase;">${i.category.replace("_", " ")}</td>
    </tr>`;

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#7c3aed,#8b5cf6);padding:24px;color:#fff;">
        <h1 style="margin:0;font-size:20px;">SEO Monitor — Weekly Digest</h1>
        <p style="margin:4px 0 0;opacity:.85;font-size:13px;">${new Date().toUTCString().slice(0, 16)}</p>
      </div>
      <div style="padding:24px;">
        <div style="display:flex;gap:16px;margin-bottom:24px;">
          <div style="flex:1;background:#f1f5f9;padding:16px;border-radius:8px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">New this week</div>
            <div style="font-size:28px;font-weight:700;color:#7c3aed;">${newCount}</div>
          </div>
          <div style="flex:1;background:#f1f5f9;padding:16px;border-radius:8px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Open total</div>
            <div style="font-size:28px;font-weight:700;color:#0f172a;">${openCount}</div>
          </div>
          <div style="flex:1;background:#f1f5f9;padding:16px;border-radius:8px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Audits</div>
            <div style="font-size:28px;font-weight:700;color:#0f172a;">${runs?.length || 0}</div>
          </div>
        </div>

        <h2 style="font-size:14px;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em;">New issues</h2>
        ${newCount === 0 ? `<p style="color:#64748b;font-size:13px;">No new SEO issues detected this week.</p>` : `
          <table style="width:100%;border-collapse:collapse;">${(recent || []).slice(0, 20).map(issueRow).join("")}</table>
        `}

        ${openCount > 0 ? `
          <h2 style="font-size:14px;color:#0f172a;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.05em;">Top open issues</h2>
          <table style="width:100%;border-collapse:collapse;">${(openIssues || []).slice(0, 10).map(issueRow).join("")}</table>
        ` : ""}

        <div style="margin-top:32px;text-align:center;">
          <a href="https://salesos.alephwavex.io/admin/analytics?tab=seo" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Open SEO Monitor</a>
        </div>
      </div>
      <div style="padding:16px 24px;background:#f8fafc;font-size:11px;color:#64748b;text-align:center;border-top:1px solid #e5e7eb;">
        OutReign SEO Monitor · automated weekly digest
      </div>
    </div></body></html>`;

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": RESEND,
    },
    body: JSON.stringify({
      from: FROM,
      to: recipients,
      subject: `SEO Monitor — ${newCount} new issue${newCount === 1 ? "" : "s"} this week`,
      html,
    }),
  });

  const result = await res.json().catch(() => ({}));
  return json({ success: res.ok, recipients: recipients.length, new: newCount, open: openCount, result });
});
