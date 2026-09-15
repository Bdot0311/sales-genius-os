/**
 * Admin → Traffic Sources.
 *
 * Left: the visitor log (`site_visits`) rolled up by source, so we can see how
 * much traffic is genuinely unattributable versus tagged.
 * Right: the UTM link builder — the canonical tagged links to post from now on,
 * which is the only thing that recovers referrer-less mobile traffic.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CHANNELS, DESTINATIONS, buildAllChannelLinks } from "@/lib/utm";
import { SignupChannelsCard } from "@/components/admin/SignupChannelsCard";

type SourceRow = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  visits: number;
  first_visits: number;
  last_seen: string;
};

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const AdminTraffic = () => {
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (range: string) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_traffic_sources", { p_days: Number(range) });
    if (error) {
      toast.error(`Could not load traffic sources: ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as SourceRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load(days);
  }, [days]);

  const totals = useMemo(() => {
    const visits = rows.reduce((sum, r) => sum + Number(r.visits), 0);
    const unattributed = rows
      .filter((r) => ["direct", "unknown"].includes(r.utm_source))
      .reduce((sum, r) => sum + Number(r.visits), 0);
    return {
      visits,
      unattributed,
      share: visits ? Math.round((unattributed / visits) * 100) : 0,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-foreground">Traffic Sources</h2>
        <p className="text-muted-foreground">
          First-hand visitor log plus the tagged links to use everywhere you post.
        </p>
      </div>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Visitor log</TabsTrigger>
          <TabsTrigger value="channels">Signup channels</TabsTrigger>
          <TabsTrigger value="builder">UTM link builder</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4">
          <SignupChannelsCard />
        </TabsContent>


        <TabsContent value="log" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load(days)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Panel>
              <PanelHeader className="pb-2"><PanelDescription>Logged visits</PanelDescription></PanelHeader>
              <PanelBody><p className="text-3xl font-bold">{totals.visits}</p></PanelBody>
            </Panel>
            <Panel>
              <PanelHeader className="pb-2"><PanelDescription>Unattributable</PanelDescription></PanelHeader>
              <PanelBody>
                <p className="text-3xl font-bold">{totals.unattributed}</p>
                <p className="text-xs text-muted-foreground">{totals.share}% of visits</p>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader className="pb-2"><PanelDescription>Distinct sources</PanelDescription></PanelHeader>
              <PanelBody><p className="text-3xl font-bold">{rows.length}</p></PanelBody>
            </Panel>
          </div>

          <Panel>
            <PanelHeader>
              <PanelTitle>By source</PanelTitle>
              <PanelDescription>
                Source and medium come from utm params when present, otherwise from the referrer.
              </PanelDescription>
            </PanelHeader>
            <PanelBody>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">New visitors</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {loading ? "Loading…" : "No visits logged in this window yet."}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r, i) => (
                    <TableRow key={`${r.utm_source}-${r.utm_medium}-${r.utm_campaign}-${i}`}>
                      <TableCell className="font-medium">{r.utm_source}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.utm_medium}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.utm_campaign || "—"}</TableCell>
                      <TableCell className="text-right">{r.visits}</TableCell>
                      <TableCell className="text-right">{r.first_visits}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(r.last_seen).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="builder">
          <LinkBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const LinkBuilder = () => {
  const [path, setPath] = useState("/");
  const [campaign, setCampaign] = useState("");

  const links = useMemo(() => buildAllChannelLinks(path, campaign), [path, campaign]);
  const groups = useMemo(() => {
    const out = new Map<string, typeof links>();
    for (const link of links) {
      const list = out.get(link.group) ?? [];
      list.push(link);
      out.set(link.group, list);
    }
    return Array.from(out.entries());
  }, [links]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>
          <PanelTitle>Tagged links</PanelTitle>
          <PanelDescription>
            Use these instead of the bare URL. Mobile apps strip referrers, so a tagged link is the
            only way an arrival can be traced back to where you posted it.
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Destination</Label>
            <Select value={path} onValueChange={setPath}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DESTINATIONS.map((d) => (
                  <SelectItem key={d.path} value={d.path}>{d.label} ({d.path})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="utm-campaign">Campaign (optional)</Label>
            <Input
              id="utm-campaign"
              placeholder="e.g. launch-week, ai-sdr-demo"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            />
          </div>
        </PanelBody>
      </Panel>

      {groups.map(([group, list]) => (
        <Panel key={group}>
          <PanelHeader className="pb-2">
            <PanelTitle>{group}</PanelTitle>
          </PanelHeader>
          <PanelBody className="space-y-2">
            {list.map((link) => (
              <div
                key={link.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 border-b last:border-0 pb-2 last:pb-0"
              >
                <span className="text-sm font-medium sm:w-56 shrink-0">{link.label}</span>
                <code className="text-xs text-muted-foreground break-all flex-1">{link.url}</code>
                <Button variant="ghost" size="sm" onClick={() => void copy(link.url)} aria-label={`Copy ${link.label} link`}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </PanelBody>
        </Panel>
      ))}

      <p className="text-xs text-muted-foreground">
        {CHANNELS.length} channels tagged from one place, so the same post never gets two different labels.
      </p>
    </div>
  );
};

export default AdminTraffic;
