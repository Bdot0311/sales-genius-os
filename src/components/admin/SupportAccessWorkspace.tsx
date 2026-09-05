import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, ExternalLink, Plus } from "lucide-react";
import {
  SCOPE_CAMPAIGN_ASSETS,
  SCOPE_LEADS,
  expiresInWords,
  sectionsFor,
  type GrantLike,
} from "@/lib/support-access";

interface SequenceRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  steps: number;
}

interface Loaded {
  sequences: SequenceRow[];
  drafts: number;
  leads: number;
  hasIcp: boolean;
  hasAgent: boolean;
}

/**
 * The customer's campaign assets, reached through an active support grant.
 *
 * Nothing here is privileged in a new way — every one of these tables already
 * carries a policy admitting an admin while a grant is live. What was missing
 * was any query that asked for another user's rows: the app's own hooks all
 * filter on the signed-in user's id, so the granted access had no surface.
 *
 * Sequences link straight into the normal builder. It loads a sequence by id
 * with no user filter, so it already works on a customer's sequence under RLS
 * — the id was simply undiscoverable from here.
 */
export function SupportAccessWorkspace({
  grant,
  customerLabel,
}: {
  grant: GrantLike & { id: string; user_id: string };
  customerLabel: string;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Loaded | null>(null);
  const sections = sectionsFor(grant);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [seqRes, draftRes, leadRes, icpRes, agentRes] = await Promise.all([
        sections.campaignAssets
          ? supabase
              .from("email_sequences")
              .select("id, name, status, created_at")
              .eq("user_id", grant.user_id)
              .order("created_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] }),
        sections.campaignAssets
          ? supabase
              .from("email_drafts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", grant.user_id)
          : Promise.resolve({ count: 0 }),
        sections.leads
          ? supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("user_id", grant.user_id)
          : Promise.resolve({ count: 0 }),
        sections.campaignAssets
          ? supabase.from("icp_profiles").select("id").eq("user_id", grant.user_id).limit(1)
          : Promise.resolve({ data: [] }),
        sections.campaignAssets
          ? supabase.from("agent_configs").select("id").eq("user_id", grant.user_id).limit(1)
          : Promise.resolve({ data: [] }),
      ]);

      const sequences = (seqRes as { data?: unknown[] }).data ?? [];
      // Step counts one query rather than one per sequence.
      const ids = sequences.map((s) => (s as SequenceRow).id);
      const stepCounts = new Map<string, number>();
      if (ids.length) {
        const { data: steps } = await supabase
          .from("sequence_steps")
          .select("sequence_id")
          .in("sequence_id", ids);
        for (const row of (steps ?? []) as { sequence_id: string }[]) {
          stepCounts.set(row.sequence_id, (stepCounts.get(row.sequence_id) ?? 0) + 1);
        }
      }

      setData({
        sequences: sequences.map((s) => {
          const row = s as SequenceRow;
          return { ...row, steps: stepCounts.get(row.id) ?? 0 };
        }),
        drafts: (draftRes as { count?: number | null }).count ?? 0,
        leads: (leadRes as { count?: number | null }).count ?? 0,
        hasIcp: (((icpRes as { data?: unknown[] }).data ?? []).length) > 0,
        hasAgent: (((agentRes as { data?: unknown[] }).data ?? []).length) > 0,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load this account");
    } finally {
      setLoading(false);
    }
  }, [grant.user_id, sections.campaignAssets, sections.leads]);

  useEffect(() => {
    void load();
    // The audit table recorded only the END of access, so what the team did
    // between grant and revocation was the part nobody could reconstruct —
    // which is exactly the part a customer would ask about.
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("support_access_events").insert({
        grant_id: grant.id,
        user_id: grant.user_id,
        admin_id: user.id,
        action: "Opened the account to do setup work",
      });
    })();
  }, [load, grant.id, grant.user_id]);

  if (sections.blockedReason) {
    return <p className="text-sm text-muted-foreground">{sections.blockedReason}</p>;
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {customerLabel}'s campaign assets…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Access ends in {expiresInWords(grant.expires_at)}.</span>
        {!sections.leads && (
          <Badge variant="outline" className="text-[10px]">
            Leads not covered by this grant
          </Badge>
        )}
        {!sections.campaignAssets && (
          <Badge variant="outline" className="text-[10px]">
            Campaign assets not covered by this grant
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Sequences", value: data?.sequences.length ?? 0, shown: sections.campaignAssets },
          { label: "Saved drafts", value: data?.drafts ?? 0, shown: sections.campaignAssets },
          { label: "Leads", value: data?.leads ?? 0, shown: sections.leads },
          {
            label: "ICP / agent",
            value: `${data?.hasIcp ? "ICP" : "no ICP"} · ${data?.hasAgent ? "agent" : "no agent"}`,
            shown: sections.campaignAssets,
          },
        ]
          .filter((s) => s.shown)
          .map((s) => (
            <div key={s.label} className="rounded-md border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold">{s.value}</p>
            </div>
          ))}
      </div>

      {sections.campaignAssets && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Their sequences</h4>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/dashboard/outreach?tab=sequences">
                <Plus className="h-3.5 w-3.5" /> Build a new one
              </Link>
            </Button>
          </div>
          {data && data.sequences.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              They have no sequences yet — this is what the setup is for.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.sequences.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.steps}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost" className="gap-1.5">
                          <Link to={`/dashboard/sequences/${s.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" /> Edit
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
