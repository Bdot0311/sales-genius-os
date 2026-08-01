import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Sparkles, Wand2 } from "lucide-react";

interface Touch {
  day: number;
  purpose: string;
  subject: string;
  body: string;
  hook_used?: string;
  payoff_id?: string | null;
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
  const [lowPersonalization, setLowPersonalization] = useState(false);
  const [briefs, setBriefs] = useState<{ id: string; name: string }[]>([]);
  const [briefId, setBriefId] = useState<string>("");
  const [rubric, setRubric] = useState<any[] | null>(null);
  const [whyNow, setWhyNow] = useState<any[]>([]);

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
      const { data: briefRows } = await supabase.from("campaign_briefs").select("id, name").eq("user_id", user.id).order("created_at", { ascending: false });
      if (mounted) setBriefs((briefRows as any) || []);
    })();
    return () => { mounted = false; };
  }, []);

  const selectedLead = leads.find((l) => l.id === leadId);

  // Surface the selected account's why-now claims (they feed the why_now token).
  useEffect(() => {
    (async () => {
      if (!selectedLead?.company_name) { setWhyNow([]); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: comp } = await supabase.from("companies").select("id").eq("user_id", user.id).eq("name", selectedLead.company_name).maybeSingle();
      if (!comp) { setWhyNow([]); return; }
      const { data: wn } = await supabase.from("why_now_research").select("claims").eq("user_id", user.id).eq("company_id", comp.id).maybeSingle();
      setWhyNow(Array.isArray(wn?.claims) ? wn.claims : []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

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
          briefId: briefId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.blocked) throw new Error("could not resolve " + (data.missing_tokens || []).join(", ") + " for this lead. pick a lead with a name and company.");
      const t: Touch[] = Array.isArray(data?.touches) ? data.touches : [];
      if (t.length === 0) throw new Error("No sequence returned");
      setTouches(t);
      setLowPersonalization(Boolean(data?.low_personalization));
      setRubric(Array.isArray(data?.rubric) ? data.rubric : null);
      toast({ title: "Sequence ready", description: `Generated ${t.length} touches following the cold email engine rules.` });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyTouch = (t: Touch) => {
    const text = `Subject: ${t.subject}\n\n${t.body}`;
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

          {briefs.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <Label>Campaign brief (optional — grounds copy in your brief)</Label>
              <Select value={briefId || "none"} onValueChange={(v) => setBriefId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No brief" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No brief</SelectItem>
                  {briefs.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {whyNow.filter((c: any) => c.confidence !== "low").length > 0 && (
            <div className="md:col-span-2 rounded-md border border-border/60 p-3 text-xs space-y-1">
              <p className="text-muted-foreground">why-now for this account (feeds the why_now token):</p>
              {whyNow.filter((c: any) => c.confidence !== "low").slice(0, 3).map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2"><Badge variant="outline" className="text-[10px]">{c.confidence}</Badge><span>{c.claim}</span></div>
              ))}
            </div>
          )}

          <div className="md:col-span-2">
            <Button onClick={handleGenerate} disabled={loading} className="w-full">
              {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating 4 touches…</>) : (<><Sparkles className="w-4 h-4 mr-2" /> Generate sequence</>)}
            </Button>
          </div>
        </CardContent>
      </Card>

      {touches.length > 0 && (
        <div className="space-y-4">
          {lowPersonalization && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-600 dark:text-yellow-500">
              <span>this prospect had no hook above generic persona pain. review carefully, or route it to a segment-level sequence.</span>
            </div>
          )}
          {touches.map((t, i) => (
            <Card key={i} className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Day {t.day}</Badge>
                  <span className="text-muted-foreground font-normal capitalize">{t.purpose}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Subject</div>
                  <div className="text-sm font-medium">{t.subject || "—"}</div>
                  {t.hook_used && <div className="text-[11px] text-muted-foreground mt-1">hook: {t.hook_used}</div>}
                </div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {t.body}
                </div>
                {rubric?.[i]?.dimensions && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(rubric[i].dimensions).map(([k, v]: any) => (
                      <Badge key={k} variant="outline" className={`text-[10px] ${rubric[i].weakest === k ? "border-destructive text-destructive" : ""}`}>
                        {k.replace(/_/g, " ")} {v.score}/5
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyTouch(t)}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy touch
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate("/dashboard/outreach", { state: { prefillBody: t.body, prefillSubject: t.subject || "" } })}
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
