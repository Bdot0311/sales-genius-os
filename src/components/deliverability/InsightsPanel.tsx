import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Inbox, MessageSquareWarning, ShieldCheck } from "lucide-react";
import { VerdictTile } from "@/components/deliverability/VerdictTile";
import {
  authVerdict,
  bounceVerdict,
  complaintVerdict,
  placementVerdict,
  type PlacementInput,
  type Verdict,
} from "@/lib/deliverability-verdict";
import { totalStats, type LiveStats, type SendingDomain } from "@/lib/deliverability-db";

/**
 * The diagnosis layer.
 *
 * Four tiles, each carrying a state, a named cause and the thing that fixes it.
 * This sits above Connection Health on the page on purpose: whether mail lands
 * is the question, and whether the mailbox is connected is only the precondition.
 */

/** The most recent seed test's results — placement is measured, not inferred. */
function useLatestPlacement() {
  return useQuery({
    queryKey: ["latest-placement"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<PlacementInput[]> => {
      const { data: test } = await supabase
        .from("placement_tests")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!test) return [];

      const { data: results } = await supabase
        .from("placement_results")
        .select("provider, placement, tab, observed_at")
        .eq("test_id", test.id);

      return ((results as PlacementInput[]) ?? []);
    },
  });
}

interface Props {
  domains: SendingDomain[];
  stats: LiveStats[];
  /** Explore shows the state layer only — the cause and fix are the product. */
  locked?: boolean;
  onUpgrade?: () => void;
}

export const InsightsPanel = ({ domains, stats, locked = false, onUpgrade }: Props) => {
  const navigate = useNavigate();
  const placementQ = useLatestPlacement();

  const totals = useMemo(() => totalStats(stats), [stats]);

  // Outreach sends only. Warmup mail travels between our own mailboxes, so
  // folding it in would flatter every rate on this panel.
  const volume = { sent: totals.outreach, bounced: totals.bounced, complaints: totals.complaints };

  const tiles: { title: string; icon: JSX.Element; verdict: Verdict }[] = [
    { title: "Inbox placement", icon: <Inbox className="h-4 w-4" />, verdict: placementVerdict(placementQ.data ?? []) },
    { title: "Authentication", icon: <ShieldCheck className="h-4 w-4" />, verdict: authVerdict(domains) },
    { title: "Bounce rate", icon: <Eye className="h-4 w-4" />, verdict: bounceVerdict(volume) },
    { title: "Complaint rate", icon: <MessageSquareWarning className="h-4 w-4" />, verdict: complaintVerdict(volume) },
  ];

  const runAction = (verdict: Verdict) => {
    const target = verdict.action?.target ?? "";
    if (verdict.action?.kind === "navigate" && target.startsWith("/")) {
      navigate(target);
      return;
    }
    // In-page targets and "run" actions both scroll to the panel that owns the
    // fix, which is where the button to do it already lives.
    const anchor = target.startsWith("#") ? target.slice(1) : target;
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <VerdictTile
          key={t.title}
          title={t.title}
          icon={t.icon}
          verdict={t.verdict}
          locked={locked}
          onUpgrade={onUpgrade}
          onAction={runAction}
        />
      ))}
    </div>
  );
};
