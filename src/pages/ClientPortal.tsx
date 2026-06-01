import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Mail, TrendingUp, MessageSquare, CalendarCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PortalData {
  agencyName: string;
  agencyLogo: string | null;
  agencyColor: string;
  clientEmail: string;
  stats: { label: string; value: string; icon: React.ReactNode }[];
  activity: { date: string; contact: string; company: string; status: string }[];
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Replied: "default",
  Opened: "secondary",
  Sent: "outline",
  Bounced: "destructive",
  Clicked: "secondary",
};

const ClientPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Invalid portal link."); setLoading(false); return; }

    const load = async () => {
      try {
        // Resolve the invite token to agency + client
        const { data: clientRow, error: cErr } = await supabase
          .from("agency_clients")
          .select("agency_id, client_user_id, invite_email, status")
          .eq("invite_token", token)
          .maybeSingle();

        if (cErr) throw cErr;
        if (!clientRow) { setError("This portal link is invalid or has expired."); return; }
        if (clientRow.status !== "active") {
          setError("This client portal is not yet active. Please contact your agency.");
          return;
        }

        const agencyId = clientRow.agency_id;
        const clientUserId = clientRow.client_user_id;

        // Load agency branding
        const { data: wl } = await supabase
          .from("white_label_settings")
          .select("company_name, logo_url, primary_color")
          .eq("user_id", agencyId)
          .maybeSingle();

        const agencyName = wl?.company_name || "Your Agency";
        const agencyLogo = wl?.logo_url || null;
        const agencyColor = wl?.primary_color || "#8B5CF6";

        let emailsSent = 0;
        let opens = 0;
        let replies = 0;
        let meetings = 0;
        const activityRows: PortalData["activity"] = [];

        if (clientUserId) {
          // Load client's sent emails stats
          const { data: sentEmails } = await supabase
            .from("sent_emails")
            .select("id, subject, status, sent_at, lead_id")
            .eq("user_id", clientUserId)
            .order("sent_at", { ascending: false })
            .limit(50);

          if (sentEmails) {
            emailsSent = sentEmails.length;
            opens = sentEmails.filter(e => e.status === "opened" || e.status === "clicked").length;
            replies = sentEmails.filter(e => e.status === "replied").length;

            // Get lead names for activity table
            const leadIds = [...new Set(sentEmails.map(e => e.lead_id).filter(Boolean))];
            let leadsMap: Record<string, { name: string; company: string }> = {};

            if (leadIds.length > 0) {
              const { data: leadsData } = await supabase
                .from("leads")
                .select("id, contact_name, company_name")
                .in("id", leadIds);
              if (leadsData) {
                leadsData.forEach(l => { leadsMap[l.id] = { name: l.contact_name || "Unknown", company: l.company_name || "" }; });
              }
            }

            sentEmails.slice(0, 10).forEach(e => {
              const lead = leadsMap[e.lead_id] || { name: "Unknown", company: "" };
              const statusMap: Record<string, string> = {
                sent: "Sent", opened: "Opened", clicked: "Clicked",
                replied: "Replied", bounced: "Bounced",
              };
              activityRows.push({
                date: e.sent_at ? new Date(e.sent_at).toLocaleDateString() : "—",
                contact: lead.name,
                company: lead.company,
                status: statusMap[e.status] || e.status,
              });
            });
          }

          // Meetings booked = activities of type 'meeting'
          const { count: meetingCount } = await supabase
            .from("activities")
            .select("id", { count: "exact", head: true })
            .eq("user_id", clientUserId)
            .eq("type", "meeting");
          meetings = meetingCount || 0;
        }

        const openRate = emailsSent > 0 ? ((opens / emailsSent) * 100).toFixed(1) + "%" : "—";
        const replyRate = emailsSent > 0 ? ((replies / emailsSent) * 100).toFixed(1) + "%" : "—";

        setData({
          agencyName,
          agencyLogo,
          agencyColor,
          clientEmail: clientRow.invite_email || "",
          stats: [
            { label: "Emails Sent", value: emailsSent.toLocaleString(), icon: <Mail className="h-4 w-4" /> },
            { label: "Open Rate", value: openRate, icon: <TrendingUp className="h-4 w-4" /> },
            { label: "Reply Rate", value: replyRate, icon: <MessageSquare className="h-4 w-4" /> },
            { label: "Meetings Booked", value: meetings.toLocaleString(), icon: <CalendarCheck className="h-4 w-4" /> },
          ],
          activity: activityRows,
        });
      } catch (e: any) {
        setError(e.message || "Failed to load portal.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-sm text-center">
          <p className="text-muted-foreground text-sm">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.agencyLogo ? (
              <img src={data.agencyLogo} alt={data.agencyName} className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: data.agencyColor }}
              >
                {data.agencyName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-base font-semibold text-foreground">{data.agencyName}</span>
          </div>
          <span className="text-xs text-muted-foreground">Powered by SalesOS</span>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Campaign overview */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Outreach Report</p>
              <h1 className="text-2xl font-bold">Campaign Performance</h1>
              {data.clientEmail && (
                <p className="text-sm text-muted-foreground mt-1">{data.clientEmail}</p>
              )}
            </div>
            <Badge className="self-start sm:self-center bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
              Live
            </Badge>
          </div>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {data.stats.map((stat) => (
            <Card key={stat.label} className="p-5">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                {stat.icon}
                <span className="text-xs">{stat.label}</span>
              </div>
              <p className="text-3xl font-bold">{stat.value}</p>
            </Card>
          ))}
        </div>

        {/* Recent activity */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activity.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{row.date}</TableCell>
                    <TableCell className="font-medium">{row.contact}</TableCell>
                    <TableCell>{row.company}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[row.status] ?? "outline"}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-5xl mx-auto px-6 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Report powered by {data.agencyName} · SalesOS
          </p>
        </div>
      </footer>
    </div>
  );
};

export default ClientPortal;
