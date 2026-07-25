import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Sparkles, Wand2 } from "lucide-react";

interface Touch {
  day: number;
  purpose: string;
  subject_variations: { curiosity?: string; results?: string; question?: string };
  body: string;
}

interface LeadOption {
  id: string;
  contact_name: string | null;
  company_name: string | null;
  job_title: string | null;
  industry: string | null;
  employee_count: string | null;
  company_size: string | null;
  signals: string[] | null;
}

export const AiSequenceBuilder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadId, setLeadId] = useState<string>("");
  const [senderName, setSenderName] = useState("");
  const [senderCompany, setSenderCompany] = useState("");
  const [offer, setOffer] = useState("");
  const [proof, setProof] = useState("");
  const [signal, setSignal] = useState("");
  const [loading, setLoading] = useState(false);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [activeSubject, setActiveSubject] = useState<Record<number, keyof Touch["subject_variations"]>>({
    0: "curiosity", 1: "curiosity", 2: "curiosity", 3: "curiosity",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = userRes?.user;
      if (!user) return;
      const [{ data: profile }, { data: leadRows }] = await Promise.all([
        supabase.from("profiles").select("full_name, company_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("leads")
          .select("id, contact_name, company_name, job_title, industry, employee_count, company_size, signals")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (!mounted) return;
      if (profile?.full_name) setSenderName(profile.full_name);
      if (profile?.company_name) setSenderCompany(profile.company_name);
      setLeads((leadRows as any) || []);
    })();
    return () => { mounted = false; };
  }, []);

  const selectedLead = leads.find((l) => l.id === leadId);

  const handleGenerate = async () => {
    if (!leadId || !offer.trim()) {
      toast({ title: "Missing details", description: "Pick a lead and describe your offer first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setTouches([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sequence", {
        body: {
          lead: selectedLead,
          senderName,
          senderCompany,
          offer,
          proof,
          signal: signal || (selectedLead?.signals?.[0] ?? ""),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const t: Touch[] = Array.isArray(data?.touches) ? data.touches : [];
      if (t.length === 0) throw new Error("No sequence returned");
      setTouches(t);
      toast({ title: "Sequence ready", description: `Generated ${t.length} touches following the cold email engine rules.` });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyTouch = (t: Touch, subjectKey: keyof Touch["subject_variations"]) => {
    const subj = t.subject_variations?.[subjectKey] || "";
    const text = `Subject: ${subj}\n\n${t.body}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `Touch (day ${t.day}) copied to clipboard.` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          AI Sequence Builder
        </h3>
        <p className="text-sm text-muted-foreground">
          Generate a 4-touch cold email sequence tuned to the OutReign cold-email engine: 50–75 words, one signal per touch, low-friction CTAs.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Prospect</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a lead" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {(l.contact_name || "Unnamed")} — {l.company_name || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLead?.signals && selectedLead.signals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedLead.signals.slice(0, 6).map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Your name</Label>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="First Last" />
          </div>
          <div className="space-y-2">
            <Label>Your company</Label>
            <Input value={senderCompany} onChange={(e) => setSenderCompany(e.target.value)} placeholder="Company name" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>What you sell / offer</Label>
            <Textarea
              rows={2}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. Founder-led outbound engine that fills mid-market SaaS calendars in 30 days"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Verified proof (optional but recommended)</Label>
            <Textarea
              rows={2}
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="Real name + metric + timeframe. e.g. Helped Acme go from 4 to 22 booked calls in 90 days."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Signal to lead with (optional — defaults to top lead signal)</Label>
            <Input
              value={signal}
              onChange={(e) => setSignal(e.target.value)}
              placeholder="e.g. Just hired a new VP of Sales / migrated off Salesforce / expanded to EU"
            />
          </div>

          <div className="md:col-span-2">
            <Button onClick={handleGenerate} disabled={loading} className="w-full">
              {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating 4 touches…</>) : (<><Sparkles className="w-4 h-4 mr-2" /> Generate sequence</>)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {touches.length > 0 && (
        <div className="space-y-4">
          {touches.map((t, i) => (
            <Card key={i} className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Day {t.day}</Badge>
                  <span className="text-muted-foreground font-normal capitalize">{t.purpose}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Tabs
                  value={activeSubject[i] || "curiosity"}
                  onValueChange={(v) => setActiveSubject((s) => ({ ...s, [i]: v as any }))}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="curiosity" className="text-xs h-6">Curiosity</TabsTrigger>
                    <TabsTrigger value="results" className="text-xs h-6">Results</TabsTrigger>
                    <TabsTrigger value="question" className="text-xs h-6">Question</TabsTrigger>
                  </TabsList>
                  {(["curiosity", "results", "question"] as const).map((k) => (
                    <TabsContent key={k} value={k} className="pt-2">
                      <div className="text-xs text-muted-foreground mb-1">Subject</div>
                      <div className="text-sm font-medium">{t.subject_variations?.[k] || "—"}</div>
                    </TabsContent>
                  ))}
                </Tabs>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {t.body}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyTouch(t, activeSubject[i] || "curiosity")}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy touch
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate("/dashboard/outreach", { state: { prefillBody: t.body, prefillSubject: t.subject_variations?.[activeSubject[i] || "curiosity"] || "" } })}
                  >
                    Open in Compose →
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AiSequenceBuilder;
