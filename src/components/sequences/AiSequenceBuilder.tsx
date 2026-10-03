import { useEffect, useState } from "react";
import { LeadMultiSelect } from "@/components/outreach/LeadMultiSelect";
import { useNavigate } from "react-router-dom";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, Sparkles, Wand2, Users } from "lucide-react";
import { ENROLMENT_START_STEP, firstActionAt, stepsFromTouches } from "@/lib/sequence-from-touches";

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
  /*
   * A set, like Outreach Studio's.
   *
   * leadId stays as the prospect the sequence is written from: the steps are
   * the campaign and the leads are who walks through it, so one sequence is
   * generated rather than one per person. What the set buys today is not
   * having to re-pick a lead for every generation, and it is what enrolment
   * will read when it lands.
   */
  const [leadId, setLeadId] = useState<string>("");
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [senderName, setSenderName] = useState("");
  const [senderCompany, setSenderCompany] = useState("");
  const [offer, setOffer] = useState("");
  const [proof, setProof] = useState("");
  const [signal, setSignal] = useState("");
  const [loading, setLoading] = useState(false);
  const [touches, setTouches] = useState<Touch[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [sequenceName, setSequenceName] = useState("");
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

  /*
   * Saving the sequence, and putting everyone selected into it.
   *
   * Until now this screen generated touches and offered to copy them, so
   * "build a sequence for these prospects" ended at the clipboard and the
   * cadence had to be rebuilt by hand in the sequence editor.
   *
   * One sequence is written and every selected lead is enrolled into it. The
   * steps are the campaign and the leads are who walks through it, so this is
   * one row in email_sequences, N in sequence_steps, and one enrolment per
   * prospect -- not a sequence each.
   *
   * It writes as the user through RLS rather than through a function: all
   * three tables already carry owner policies, and the dispatcher that walks
   * the steps is the one the rest of the product uses.
   */
  const saveAndEnrol = async () => {
    if (touches.length === 0 || leadIds.length === 0) return;
    setEnrolling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const name = (sequenceName.trim() ||
        `${selectedLead?.company_name || "Sequence"} — ${touches.length} touches`).slice(0, 120);

      const { data: sequence, error: seqError } = await supabase
        .from("email_sequences")
        .insert({
          user_id: user.id,
          name,
          description: offer.trim().slice(0, 500) || null,
          // Active, because the dispatcher only walks sequences that are, and
          // enrolling into a draft would look like it had silently failed.
          status: "active",
        })
        .select("id")
        .single();
      if (seqError || !sequence) throw new Error(seqError?.message || "Could not save the sequence");

      const { error: stepsError } = await supabase.from("sequence_steps").insert(
        // user_id as well as sequence_id: the table carries its own owner
        // column now, beyond the ownership its RLS reads through the sequence.
        stepsFromTouches(touches).map((step) => ({
          ...step,
          sequence_id: sequence.id,
          user_id: user.id,
        })),
      );
      if (stepsError) {
        // A sequence with no steps enrols people into nothing and sends
        // forever without sending anything.
        await supabase.from("email_sequences").delete().eq("id", sequence.id);
        throw new Error(stepsError.message);
      }

      const startAt = firstActionAt(touches);
      const { data: enrolled, error: enrolError } = await supabase
        .from("sequence_enrollments")
        .insert(
          leadIds.map((leadId) => ({
            user_id: user.id,
            sequence_id: sequence.id,
            lead_id: leadId,
            // Not the column default of 1: the dispatcher sends
            // current_step + 1, so starting at 1 skips the opener.
            current_step: ENROLMENT_START_STEP,
            status: "active",
            next_action_at: startAt,
          })),
        )
        .select("id");
      if (enrolError) throw new Error(enrolError.message);

      const count = (enrolled ?? []).length;
      toast({
        title: `${count} ${count === 1 ? "prospect" : "prospects"} enrolled`,
        description: `"${name}" is active. The first touch goes out ${
          touches[0]?.day ? `in ${touches[0].day} days` : "shortly"
        }, and the rest follow on their own.`,
      });
      navigate(`/dashboard/sequences/${sequence.id}`);
    } catch (e: any) {
      toast({
        title: "Could not enrol",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setEnrolling(false);
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

      <Panel>
        <PanelHeader className="pb-3">
          <PanelTitle>Inputs</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{leadIds.length > 1 ? "Prospects" : "Prospect"}</Label>
            <LeadMultiSelect
              leads={leads}
              value={leadIds}
              placeholder="Pick prospects"
              onChange={(ids) => {
                setLeadIds(ids);
                if (ids.length === 0) setLeadId("");
                else if (!ids.includes(leadId)) setLeadId(ids[0]);
              }}
            />
            {leadIds.length > 1 && (
              <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
                Written from {selectedLead?.contact_name || "the first prospect"}. The steps are the
                campaign, so one sequence covers all {leadIds.length}.
              </p>
            )}
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
        </PanelBody>
      </Panel>

      {touches.length > 0 && (
        <div className="space-y-4">
          {/* The cadence exists; this is what turns it into a campaign.
              Before, the only way out of this screen was the clipboard. */}
          <Panel>
            <PanelBody className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <Label htmlFor="sequence-name">Name</Label>
                <Input
                  id="sequence-name"
                  value={sequenceName}
                  onChange={(e) => setSequenceName(e.target.value)}
                  placeholder={`${selectedLead?.company_name || "Sequence"} — ${touches.length} touches`}
                />
              </div>
              <Button onClick={saveAndEnrol} disabled={enrolling || leadIds.length === 0}>
                {enrolling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Users className="mr-2 h-4 w-4" />
                )}
                {leadIds.length === 1
                  ? "Save and enrol 1 prospect"
                  : `Save and enrol ${leadIds.length} prospects`}
              </Button>
              <p className="w-full text-[0.6875rem] leading-relaxed text-muted-foreground">
                One sequence, every selected prospect walking through it. The first touch goes out
                {touches[0]?.day ? ` in ${touches[0].day} days` : " shortly"}, and the rest follow on
                their own — you do not need to stay on this page.
              </p>
            </PanelBody>
          </Panel>

          {lowPersonalization && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-500">
              <span>this prospect had no hook above generic persona pain. review carefully, or route it to a segment-level sequence.</span>
            </div>
          )}
          {touches.map((t, i) => (
            <Panel key={i} className="border-primary/20">
              <PanelHeader className="pb-3">
                <PanelTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Day {t.day}</Badge>
                  <span className="text-muted-foreground font-normal capitalize">{t.purpose}</span>
                </PanelTitle>
              </PanelHeader>
              <PanelBody className="space-y-3">
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
              </PanelBody>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
};

export default AiSequenceBuilder;
