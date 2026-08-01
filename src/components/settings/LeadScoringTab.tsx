import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

// Mirror of the server DEFAULT_RUBRIC shape (supabase/functions/_shared/lead-scoring.ts).
const DEFAULT_WEIGHTS = {
  fit: { industry: 30, headcount: 20, seniority: 20, function: 15, geography: 10, tech: 5 },
  intent: { base_signal: 20, recency_half_life_days: 14, count_weight: 10, repeat_account_bonus: 15 },
  thresholds: { a_fit_min: 70, b_fit_min: 40 },
};

type Weights = typeof DEFAULT_WEIGHTS;

interface PreviewRow {
  lead_id: string;
  company_name: string;
  contact_name: string;
  tier: string;
  fit_score: number;
  intent_score: number;
  reason: string;
}

const FIT_KEYS: [keyof Weights["fit"], string][] = [
  ["industry", "industry"], ["headcount", "headcount"], ["seniority", "seniority"],
  ["function", "function"], ["geography", "geography"], ["tech", "tech stack"],
];

const TIER_COLOR: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/30",
  B: "text-amber-400 border-amber-500/30",
  C: "text-slate-400 border-slate-500/25",
};

export const LeadScoringTab = () => {
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await supabase.from("scoring_rubric").select("weights").eq("user_id", session.user.id).maybeSingle();
      if (data?.weights) setWeights({ ...DEFAULT_WEIGHTS, ...(data.weights as Weights) });
      setLoading(false);
    })();
  }, []);

  const setFit = (k: keyof Weights["fit"], v: number) =>
    setWeights((w) => ({ ...w, fit: { ...w.fit, [k]: v } }));
  const setIntent = (k: keyof Weights["intent"], v: number) =>
    setWeights((w) => ({ ...w, intent: { ...w.intent, [k]: v } }));
  const setThreshold = (k: keyof Weights["thresholds"], v: number) =>
    setWeights((w) => ({ ...w, thresholds: { ...w.thresholds, [k]: v } }));

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-lead-v2", {
        body: { dryRun: true, weights, sampleLimit: 10 },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setPreview(data?.preview || []);
    } catch (e: any) {
      toast.error(e?.message || "could not run preview");
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("not signed in");
      const { error } = await supabase.from("scoring_rubric").upsert(
        { user_id: session.user.id, weights, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success("scoring rubric saved. your leads will rescore shortly.");
    } catch (e: any) {
      toast.error(e?.message || "could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />loading rubric...</div>;

  const fitTotal = Object.values(weights.fit).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>lead scoring rubric</CardTitle>
          <CardDescription>tune how fit and intent are weighted, then preview against your real leads before saving. saving queues a rescore.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">fit weights</Label>
              <span className="text-xs text-muted-foreground">total {fitTotal}</span>
            </div>
            <div className="space-y-4">
              {FIT_KEYS.map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span>{label}</span>
                    <span className="font-mono text-muted-foreground">{weights.fit[key]}</span>
                  </div>
                  <Slider min={0} max={50} step={5} value={[weights.fit[key]]} onValueChange={([v]) => setFit(key, v)} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs">signal base weight</Label>
              <Input type="number" value={weights.intent.base_signal} onChange={(e) => setIntent("base_signal", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">recency half-life (days)</Label>
              <Input type="number" value={weights.intent.recency_half_life_days} onChange={(e) => setIntent("recency_half_life_days", Number(e.target.value) || 1)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">extra-signal weight</Label>
              <Input type="number" value={weights.intent.count_weight} onChange={(e) => setIntent("count_weight", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">repeat-account bonus</Label>
              <Input type="number" value={weights.intent.repeat_account_bonus} onChange={(e) => setIntent("repeat_account_bonus", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">tier a: min fit</Label>
              <Input type="number" value={weights.thresholds.a_fit_min} onChange={(e) => setThreshold("a_fit_min", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">tier b: min fit</Label>
              <Input type="number" value={weights.thresholds.b_fit_min} onChange={(e) => setThreshold("b_fit_min", Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" onClick={runPreview} disabled={previewing}>
              {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              preview on 10 leads
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              save rubric
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">preview</CardTitle>
            <CardDescription>
              {preview.length ? "how these weights would score your most recent leads. nothing is saved until you save the rubric." : "no leads to preview yet."}
            </CardDescription>
          </CardHeader>
          {preview.length > 0 && (
            <CardContent className="space-y-2">
              {preview.map((r) => (
                <div key={r.lead_id} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
                  <Badge variant="outline" className={`text-xs font-semibold ${TIER_COLOR[r.tier] || ""}`}>{r.tier}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.contact_name} · {r.company_name}</p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right">
                    <div>fit {r.fit_score}</div>
                    <div>intent {r.intent_score}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
};
