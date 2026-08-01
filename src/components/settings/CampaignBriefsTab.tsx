import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";

interface Brief {
  id: string;
  name: string;
  offer: string | null;
  replaces: string | null;
  pain_by_persona: Record<string, string>;
  proof: string[];
  forbidden_claims: string[];
}

const blank = (): Omit<Brief, "id"> => ({ name: "", offer: "", replaces: "", pain_by_persona: {}, proof: [], forbidden_claims: [] });

export const CampaignBriefsTab = () => {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Omit<Brief, "id"> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [claim, setClaim] = useState("");
  const [proofLine, setProofLine] = useState("");
  const [personaKey, setPersonaKey] = useState("");
  const [personaPain, setPersonaPain] = useState("");

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data } = await supabase.from("campaign_briefs").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    setBriefs((data as Brief[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error("give the brief a name"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("not signed in");
      const payload = {
        name: editing.name, offer: editing.offer, replaces: editing.replaces,
        pain_by_persona: editing.pain_by_persona, proof: editing.proof, forbidden_claims: editing.forbidden_claims,
        user_id: session.user.id, updated_at: new Date().toISOString(),
      };
      if (editing.id) await supabase.from("campaign_briefs").update(payload).eq("id", editing.id);
      else await supabase.from("campaign_briefs").insert(payload);
      toast.success("brief saved");
      setEditing(null);
      load();
    } catch (e: any) { toast.error(e?.message || "could not save"); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    await supabase.from("campaign_briefs").delete().eq("id", id);
    setBriefs((b) => b.filter((x) => x.id !== id));
  };

  const patch = (p: Partial<Omit<Brief, "id">>) => setEditing((e) => (e ? { ...e, ...p } : e));

  if (loading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />loading briefs...</div>;

  if (editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{editing.id ? "edit brief" : "new brief"}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>close</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs">name</Label><Input value={editing.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. q3 revops push" /></div>
          <div className="space-y-1.5"><Label className="text-xs">offer</Label><Textarea value={editing.offer || ""} onChange={(e) => patch({ offer: e.target.value })} placeholder="what you offer" className="min-h-[60px]" /></div>
          <div className="space-y-1.5"><Label className="text-xs">what it replaces</Label><Input value={editing.replaces || ""} onChange={(e) => patch({ replaces: e.target.value })} placeholder="the status quo you displace" /></div>

          <div className="space-y-1.5">
            <Label className="text-xs">pain by persona</Label>
            {Object.entries(editing.pain_by_persona).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs"><Badge variant="secondary" className="shrink-0">{k}</Badge><span className="flex-1 truncate">{v}</span>
                <button onClick={() => { const n = { ...editing.pain_by_persona }; delete n[k]; patch({ pain_by_persona: n }); }}><X className="w-3 h-3" /></button></div>
            ))}
            <div className="flex gap-2">
              <Input value={personaKey} onChange={(e) => setPersonaKey(e.target.value)} placeholder="persona / title" className="w-40 text-sm" />
              <Input value={personaPain} onChange={(e) => setPersonaPain(e.target.value)} placeholder="their pain in their words" className="text-sm" />
              <Button variant="outline" size="sm" onClick={() => { if (personaKey.trim() && personaPain.trim()) { patch({ pain_by_persona: { ...editing.pain_by_persona, [personaKey.trim()]: personaPain.trim() } }); setPersonaKey(""); setPersonaPain(""); } }}><Plus className="w-3 h-3" /></Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">proof (real and citable)</Label>
            {editing.proof.map((p, i) => (<div key={i} className="flex items-center gap-2 text-xs"><span className="flex-1">{p}</span><button onClick={() => patch({ proof: editing.proof.filter((_, idx) => idx !== i) })}><X className="w-3 h-3" /></button></div>))}
            <div className="flex gap-2"><Input value={proofLine} onChange={(e) => setProofLine(e.target.value)} placeholder="a real proof point" className="text-sm" /><Button variant="outline" size="sm" onClick={() => { if (proofLine.trim()) { patch({ proof: [...editing.proof, proofLine.trim()] }); setProofLine(""); } }}><Plus className="w-3 h-3" /></Button></div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">forbidden claims (never make these)</Label>
            {editing.forbidden_claims.length > 0 && <div className="flex flex-wrap gap-1.5">{editing.forbidden_claims.map((c) => (<Badge key={c} variant="secondary" className="gap-1 text-xs">{c}<button onClick={() => patch({ forbidden_claims: editing.forbidden_claims.filter((x) => x !== c) })}><X className="w-3 h-3" /></button></Badge>))}</div>}
            <div className="flex gap-2"><Input value={claim} onChange={(e) => setClaim(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && claim.trim()) { patch({ forbidden_claims: [...editing.forbidden_claims, claim.trim()] }); setClaim(""); } }} placeholder="press Enter to add" className="text-sm" /></div>
          </div>

          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}save brief</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle>campaign briefs</CardTitle><CardDescription>captured once per campaign and reused across its sequences. generation grounds copy in the brief and never makes a forbidden claim.</CardDescription></div>
        <Button size="sm" variant="outline" onClick={() => setEditing(blank())}><Plus className="w-4 h-4 mr-1.5" />new</Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {briefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">no briefs yet.</p>
        ) : briefs.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md hover:bg-muted/40">
            <button onClick={() => setEditing({ ...b, pain_by_persona: b.pain_by_persona || {}, proof: b.proof || [], forbidden_claims: b.forbidden_claims || [] })} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium truncate">{b.name}</p>
              {b.offer && <p className="text-xs text-muted-foreground truncate">{b.offer}</p>}
            </button>
            <Button variant="ghost" size="icon" onClick={() => remove(b.id)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
