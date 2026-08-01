import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, Plus, X, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface ObjectionEntry {
  id: string;
  type: string;
  label: string | null;
  trigger_terms: string[];
  positioning: string | null;
  talk_track: string | null;
  proof_points: string[];
  do_not_say: string[];
  competitor_name: string | null;
  strengths: string | null;
  weaknesses: string | null;
  updated_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  pricing: "pricing", timing: "timing", competitor: "competitor", authority: "authority",
  status_quo: "status quo", no_need: "no need", custom: "custom",
};

// Small chip editor: add on Enter, remove with X.
function ChipInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs">
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))}><X className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            if (!value.includes(input.trim())) onChange([...value, input.trim()]);
            setInput("");
          }
        }}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}

export const ObjectionLibrary = () => {
  const [entries, setEntries] = useState<ObjectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ObjectionEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    let { data } = await supabase.from("objection_entries").select("*").eq("user_id", session.user.id).order("type");
    // If the library is empty (agent set up before seeding), create the defaults.
    if (!data || data.length === 0) {
      await supabase.rpc("seed_objection_entries", { p_user_id: session.user.id });
      const res = await supabase.from("objection_entries").select("*").eq("user_id", session.user.id).order("type");
      data = res.data;
    }
    setEntries((data as ObjectionEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCustom = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.from("objection_entries")
      .insert({ user_id: session.user.id, type: "custom", label: "new objection" }).select().single();
    if (error) { toast.error("could not add entry"); return; }
    setEntries((e) => [...e, data as ObjectionEntry]);
    setEditing(data as ObjectionEntry);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { id, updated_at, ...fields } = editing;
      const { error } = await supabase.from("objection_entries")
        .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      setEntries((list) => list.map((e) => (e.id === id ? { ...editing } : e)));
      toast.success("objection saved");
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message || "could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("objection_entries").delete().eq("id", id);
    if (error) { toast.error("could not delete"); return; }
    setEntries((list) => list.filter((e) => e.id !== id));
    setEditing(null);
  };

  const patch = (p: Partial<ObjectionEntry>) => setEditing((e) => (e ? { ...e, ...p } : e));

  if (loading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />loading library...</div>;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold">objection library</CardTitle>
          <CardDescription>talk tracks the agent grounds its objection replies in. leave an entry empty and the agent handles that objection the way it does today.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={addCustom}><Plus className="w-4 h-4 mr-1.5" />add</Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.map((e) => {
          const filled = !!(e.positioning || e.talk_track);
          return (
            <button
              key={e.id}
              onClick={() => setEditing(e)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md hover:bg-muted/40 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{e.type === "custom" ? (e.label || "custom") : TYPE_LABEL[e.type] || e.type}</span>
                  {!filled && <Badge variant="outline" className="text-[10px] text-muted-foreground">empty</Badge>}
                </div>
                {e.trigger_terms.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">triggers: {e.trigger_terms.join(", ")}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">edit</span>
            </button>
          );
        })}
      </CardContent>

      <Sheet open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle>{editing.type === "custom" ? "custom objection" : `${TYPE_LABEL[editing.type] || editing.type} objection`}</SheetTitle>
                <SheetDescription>ground the agent's reply. it will only cite a proof point you list here, and never invent a name or number.</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                {editing.type === "custom" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">label</Label>
                    <Input value={editing.label || ""} onChange={(e) => patch({ label: e.target.value })} placeholder="e.g. integration concerns" />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">trigger terms</Label>
                  <ChipInput value={editing.trigger_terms} onChange={(v) => patch({ trigger_terms: v })} placeholder="phrase that signals this objection, press Enter" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">positioning</Label>
                  <Textarea value={editing.positioning || ""} onChange={(e) => patch({ positioning: e.target.value })} placeholder="how to frame our answer to this objection" className="min-h-[70px]" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">talk track</Label>
                  <Textarea value={editing.talk_track || ""} onChange={(e) => patch({ talk_track: e.target.value })} placeholder="the response the agent should adapt" className="min-h-[90px]" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">proof points</Label>
                  <p className="text-xs text-muted-foreground">only real, citable facts. the agent may use these verbatim and nothing else.</p>
                  {(editing.proof_points || []).map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={p} onChange={(e) => { const next = [...editing.proof_points]; next[i] = e.target.value; patch({ proof_points: next }); }} className="text-sm" />
                      <Button variant="ghost" size="icon" onClick={() => patch({ proof_points: editing.proof_points.filter((_, idx) => idx !== i) })}><X className="w-4 h-4" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => patch({ proof_points: [...(editing.proof_points || []), ""] })}><Plus className="w-3 h-3 mr-1" />add proof point</Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">do not say</Label>
                  <ChipInput value={editing.do_not_say} onChange={(v) => patch({ do_not_say: v })} placeholder="phrase to avoid, press Enter" />
                </div>

                {editing.type === "competitor" && (
                  <div className="space-y-4 rounded-lg border border-border/60 p-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">competitor name</Label>
                      <Input value={editing.competitor_name || ""} onChange={(e) => patch({ competitor_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">their strengths</Label>
                      <Textarea value={editing.strengths || ""} onChange={(e) => patch({ strengths: e.target.value })} className="min-h-[60px]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">where we differ</Label>
                      <Textarea value={editing.weaknesses || ""} onChange={(e) => patch({ weaknesses: e.target.value })} className="min-h-[60px]" />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t sticky bottom-0 bg-background pb-1">
                  <Button onClick={save} disabled={saving} className="flex-1">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}save
                  </Button>
                  {editing.type === "custom" && (
                    <Button variant="destructive" size="icon" onClick={() => remove(editing.id)}><Trash2 className="w-4 h-4" /></Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
};
