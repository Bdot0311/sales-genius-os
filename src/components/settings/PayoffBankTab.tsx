import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface PayoffEntry {
  id: string;
  type: string;
  content: string;
  source_url: string | null;
  source_of_truth: string | null;
  asserts_stat: boolean;
}

const TYPES: { value: string; label: string; hint: string }[] = [
  { value: "observation", label: "observation", hint: "a claim the generator may make from a prospect's own public data" },
  { value: "benchmark", label: "benchmark", hint: "a number you actually own and can stand behind" },
  { value: "resource", label: "resource", hint: "an ungated asset with a live url" },
  { value: "teardown", label: "teardown", hint: "a teardown or audit offer" },
];

const blank = (): Omit<PayoffEntry, "id"> => ({ type: "observation", content: "", source_url: "", source_of_truth: "", asserts_stat: false });

export const PayoffBankTab = () => {
  const [entries, setEntries] = useState<PayoffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Omit<PayoffEntry, "id">>(blank());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data } = await supabase.from("payoff_bank").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    setEntries((data as PayoffEntry[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!draft.content.trim()) { toast.error("add the content first"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("not signed in");
      const { data, error } = await supabase.from("payoff_bank")
        .insert({ ...draft, user_id: session.user.id, asserts_stat: /\d/.test(draft.content) }).select().single();
      if (error) throw error;
      setEntries((e) => [data as PayoffEntry, ...e]);
      setDraft(blank());
      toast.success("added to the payoff bank");
    } catch (e: any) { toast.error(e?.message || "could not add"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("payoff_bank").delete().eq("id", id);
    if (error) { toast.error("could not delete"); return; }
    setEntries((e) => e.filter((x) => x.id !== id));
  };

  if (loading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />loading payoff bank...</div>;

  const activeHint = TYPES.find((t) => t.value === draft.type)?.hint;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>payoff bank</CardTitle>
          <CardDescription>the generator may only use payoffs you add here. this is what keeps value-first copy honest: the model cannot invent a stat, so you supply the real ones. an empty bank means the generator falls back to observation-only copy with no numbers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">type</Label>
              <Select value={draft.type} onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">source url (optional)</Label>
              <Input value={draft.source_url || ""} onChange={(e) => setDraft((d) => ({ ...d, source_url: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          {activeHint && <p className="text-xs text-muted-foreground">{activeHint}</p>}
          <div className="space-y-1.5">
            <Label className="text-xs">content</Label>
            <Textarea value={draft.content} onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))} placeholder="the real fact, benchmark, resource, or offer" className="min-h-[70px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">source of truth (where this comes from)</Label>
            <Input value={draft.source_of_truth || ""} onChange={(e) => setDraft((d) => ({ ...d, source_of_truth: e.target.value }))} placeholder="e.g. our 2026 customer data" />
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}add to bank
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">entries</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">no entries yet. the generator will write observation-only copy until you add real payoffs.</p>
          ) : entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
              <Badge variant="outline" className="text-[10px] shrink-0">{e.type}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{e.content}</p>
                {(e.source_url || e.source_of_truth) && (
                  <p className="text-xs text-muted-foreground truncate">{e.source_of_truth}{e.source_url ? ` · ${e.source_url}` : ""}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
