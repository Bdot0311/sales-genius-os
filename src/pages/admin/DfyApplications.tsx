import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, CalendarCheck, CalendarX } from "lucide-react";
import { DFY_SOURCE, describeApplication, type DfyApplicationRow } from "@/lib/dfy-applications";

/**
 * Who applied for a done-for-you seat, and whether they booked.
 *
 * Both halves matter. A booking with no application is the problem this
 * feature exists to remove: a calendar invite from a stranger with no
 * indication of what the meeting is about. An application with no booking is
 * a live lead who got distracted, which is worth chasing.
 *
 * Rows live in `campaign_setup_requests` under a `dfy_application` source, so
 * `calendly-webhook` fills `booked_at` here with no extra wiring.
 */
export default function DfyApplications() {
  const [rows, setRows] = useState<DfyApplicationRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_setup_requests")
      .select("id, created_at, contact_name, contact_email, plan, booked_at, status, metadata")
      .eq("source", DFY_SOURCE)
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      toast.error("Could not load applications");
      return;
    }
    setRows((data ?? []) as unknown as DfyApplicationRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const booked = rows?.filter((r) => r.booked_at).length ?? 0;
  const waiting = (rows?.length ?? 0) - booked;

  return (
    <Panel>
      <PanelHeader className="flex-row items-start justify-between gap-4">
        <div>
          <PanelTitle>Done-for-you applications</PanelTitle>
          <PanelDescription>
            {rows === null
              ? "Everyone who applied for a seat, and whether they picked a time."
              : `${rows.length} application${rows.length === 1 ? "" : "s"} · ${booked} booked · ${waiting} not booked yet`}
          </PanelDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="shrink-0">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </PanelHeader>
      <PanelBody>
        {rows === null ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No applications yet. They arrive from the done-for-you panel on the pricing page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applied</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Sells</TableHead>
                  <TableHead>Outbound today</TableHead>
                  <TableHead>Sales model</TableHead>
                  <TableHead>Customer value</TableHead>
                  <TableHead>Buying / onboarding</TableHead>
                  <TableHead>Wants</TableHead>
                  <TableHead>Booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const d = describeApplication(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(r.created_at), "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.email}</p>
                        {d.company && <p className="text-xs text-muted-foreground">{d.company}</p>}
                      </TableCell>
                      <TableCell className="max-w-[260px] text-sm">{d.sells}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{d.outboundToday}</TableCell>
                      <TableCell className="min-w-[180px] text-sm">
                        <p>{d.salesModel}</p>
                        <p className="text-xs text-muted-foreground">{d.buyingMotion}</p>
                      </TableCell>
                      <TableCell className="min-w-[160px] max-w-[260px] break-words text-sm">{d.dealSize}</TableCell>
                      <TableCell className="min-w-[220px] max-w-[320px] break-words text-sm">
                        <span className={d.cycleTooLong ? "text-muted-foreground" : undefined}>
                          {d.salesCycle}
                        </span>
                        {d.onboardingTimeline !== "—" && <p className="mt-1 text-xs text-muted-foreground">Activation / onboarding: {d.onboardingTimeline}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{d.rung}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.booked_at ? (
                          <Badge variant="outline" className="gap-1 border-green-500/30 text-green-400">
                            <CalendarCheck className="h-3 w-3" />
                            {format(new Date(r.booked_at), "d MMM")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <CalendarX className="h-3 w-3" />
                            Not yet
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {rows.some((r) => describeApplication(r).cycleTooLong) && (
              <p className="mt-4 text-xs text-muted-foreground">
                Some older applications report buying cycles beyond the 90-day service term.
                Discuss buying timelines, onboarding and pipeline goals on the call; this is not a prediction of results.
              </p>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
