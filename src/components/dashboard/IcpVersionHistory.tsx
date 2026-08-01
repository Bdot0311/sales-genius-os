import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { History, ChevronDown, ChevronRight } from "lucide-react";

// Lists the saved ICP version snapshots (Phase 5). Snapshots are written by the
// trg_snapshot_icp_version trigger on every save.
export const IcpVersionHistory = ({ icpProfileId }: { icpProfileId: string }) => {
  const [versions, setVersions] = useState<{ version: number; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("icp_versions")
        .select("version, created_at")
        .eq("icp_profile_id", icpProfileId)
        .order("version", { ascending: false })
        .limit(20);
      setVersions(data || []);
    })();
  }, [icpProfileId]);

  if (versions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 p-3 text-xs">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 font-medium">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <History className="w-3.5 h-3.5" />version history ({versions.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {versions.map((v) => (
            <li key={v.version_number} className="text-muted-foreground">
              v{v.version_number} · {new Date(v.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
