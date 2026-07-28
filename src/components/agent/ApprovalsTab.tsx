import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Check, X, ShieldQuestion, RefreshCw } from "lucide-react";

interface Approval {
  id: string;
  kind: string;
  status: string;
  prospect_email: string | null;
  prospect_name: string | null;
  company_name: string | null;
  subject: string | null;
  body: string | null;
  classification: string | null;
  reasoning: string | null;
  created_at: string;
}

export function ApprovalsTab({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("agent_approvals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(`Could not load approvals: ${error.message}`);
      setItems([]);
    } else {
      const rows: Approval[] = data ?? [];
      setItems(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((r) => [r.id, { subject: r.subject ?? "", body: r.body ?? "" }])
        )
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const draft = drafts[id];
      const { data, error } = await supabase.functions.invoke("agent-approvals", {
        body:
          action === "approve"
            ? { action, id, subject: draft?.subject, body: draft?.body }
            : { action, id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(action === "approve" ? "Approved and sent" : "Draft rejected");
      setItems((prev) => prev.filter((i) => i.id !== id));
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-foreground">
          Pending approvals {items.length > 0 && `(${items.length})`}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading approvals…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldQuestion className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nothing waiting on you.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Run the agent in approval mode and drafts will show up here for review.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                  {item.kind === "outreach" ? "First-touch email" : "Reply"}
                </Badge>
                {item.classification && (
                  <Badge variant="outline" className="text-xs">
                    {item.classification.replace(/_/g, " ")}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>

              <div className="text-sm">
                <span className="text-muted-foreground">To: </span>
                <span className="font-medium">
                  {item.prospect_name ? `${item.prospect_name} · ` : ""}
                  {item.prospect_email}
                  {item.company_name ? ` · ${item.company_name}` : ""}
                </span>
              </div>

              {item.reasoning && (
                <p className="text-xs text-muted-foreground italic">Why: {item.reasoning}</p>
              )}

              <Input
                value={drafts[item.id]?.subject ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [item.id]: { ...d[item.id], subject: e.target.value } }))
                }
                placeholder="Subject"
              />
              <Textarea
                rows={8}
                value={drafts[item.id]?.body ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [item.id]: { ...d[item.id], body: e.target.value } }))
                }
                placeholder="Email body"
              />

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={busyId === item.id}
                  onClick={() => act(item.id, "approve")}
                >
                  {busyId === item.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Approve &amp; send
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={busyId === item.id}
                  onClick={() => act(item.id, "reject")}
                >
                  <X className="w-4 h-4" />
                  Reject
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
