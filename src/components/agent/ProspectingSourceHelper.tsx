import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Target, Globe } from "lucide-react";
import { useICPProfiles, type ICPProfile } from "@/hooks/use-icp-profiles";

export interface ProspectingTargeting {
  jobTitle: string;
  industry: string;
  country: string;
  companySize: string;
}

/** Full ICP context persisted on the agent config so runs stay grounded. */
export interface ICPSnapshot {
  profile_id: string | null;
  name: string;
  source: "icp_profile" | "website";
  source_domain?: string;
  target_titles: string[];
  industries: string[];
  geographies: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  company_size_bucket: string;
  departments: string[];
  seniority_levels: string[];
  tech_stack: string[];
  buying_signals: string[];
  intent_keywords: string[];
  event_triggers: string[];
  hiring_signals: string[];
  competitor_tools: string[];
  pain_points: string[];
  use_cases: string[];
  objections: string[];
  success_metrics: string[];
  value_proposition: string | null;
  customer_examples: string | null;
  disqualifiers: string | null;
  exclude_industries: string[];
  exclude_titles: string[];
  exclude_keywords: string[];
  notes: string | null;
  summary: string | null;
  captured_at: string;
}

interface Props {
  currentSnapshot?: ICPSnapshot | null;
  onApply: (t: ProspectingTargeting, snapshot: ICPSnapshot) => void;
}

const SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

function bucketFromRange(min?: number | null, max?: number | null): string {
  const lo = typeof min === "number" ? min : 0;
  const hi = typeof max === "number" && max > 0 ? max : lo;
  const mid = hi || lo;
  if (!mid) return "";
  if (mid <= 10) return "1-10";
  if (mid <= 50) return "11-50";
  if (mid <= 200) return "51-200";
  if (mid <= 500) return "201-500";
  if (mid <= 1000) return "501-1000";
  return "1000+";
}

function rangeFromBucket(bucket: string): { min: number; max: number } {
  switch (bucket) {
    case "1-10":
      return { min: 1, max: 10 };
    case "11-50":
      return { min: 11, max: 50 };
    case "51-200":
      return { min: 51, max: 200 };
    case "201-500":
      return { min: 201, max: 500 };
    case "501-1000":
      return { min: 501, max: 1000 };
    case "1000+":
      return { min: 1000, max: 10000 };
    default:
      return { min: 1, max: 10000 };
  }
}

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()) : [];

export function snapshotFromProfile(p: ICPProfile): ICPSnapshot {
  return {
    profile_id: p.id,
    name: p.name,
    source: "icp_profile",
    target_titles: arr(p.target_titles),
    industries: arr(p.industries),
    geographies: arr(p.geographies),
    company_size_min: p.company_size_min ?? null,
    company_size_max: p.company_size_max ?? null,
    company_size_bucket: bucketFromRange(p.company_size_min, p.company_size_max),
    departments: arr(p.departments),
    seniority_levels: arr(p.seniority_levels),
    tech_stack: arr(p.tech_stack),
    buying_signals: arr(p.buying_signals),
    intent_keywords: arr(p.intent_keywords),
    event_triggers: arr(p.event_triggers),
    hiring_signals: arr(p.hiring_signals),
    competitor_tools: arr(p.competitor_tools),
    pain_points: arr(p.pain_points),
    use_cases: arr(p.use_cases),
    objections: arr(p.objections),
    success_metrics: arr(p.success_metrics),
    value_proposition: p.value_proposition ?? null,
    customer_examples: p.customer_examples ?? null,
    disqualifiers: p.disqualifiers ?? null,
    exclude_industries: arr(p.exclude_industries),
    exclude_titles: arr(p.exclude_titles),
    exclude_keywords: arr(p.exclude_keywords),
    notes: p.notes ?? null,
    summary: null,
    captured_at: new Date().toISOString(),
  };
}

function targetingFromSnapshot(s: ICPSnapshot): ProspectingTargeting {
  return {
    jobTitle: s.target_titles[0] ?? "",
    industry: s.industries[0] ?? "",
    country: s.geographies[0] ?? "",
    companySize: s.company_size_bucket,
  };
}

export function ProspectingSourceHelper({ onApply, currentSnapshot }: Props) {
  const { profiles, isLoading, createProfile } = useICPProfiles();
  const [selectedId, setSelectedId] = useState(currentSnapshot?.profile_id ?? "");
  const [domain, setDomain] = useState(currentSnapshot?.source_domain ?? "");
  const [analyzing, setAnalyzing] = useState(false);

  const handleUseProfile = () => {
    const profile = profiles.find((p) => p.id === selectedId);
    if (!profile) {
      toast.error("Pick an ICP profile first");
      return;
    }
    const snapshot = snapshotFromProfile(profile);
    onApply(targetingFromSnapshot(snapshot), snapshot);
    toast.success(`Full ICP "${profile.name}" imported — save to lock it in`);
  };

  const handleAnalyze = async () => {
    const value = domain.trim();
    if (!value) {
      toast.error("Enter a website, e.g. acme.com");
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-domain", {
        body: { domain: value },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      const f = data?.filters ?? {};
      const titles = arr(f.jobTitles);
      const industries = arr(f.industries);
      const locations = arr(f.locations);
      const keywords = arr(f.keywords);
      const bucket = arr(f.companySizes).find((s) => SIZE_BUCKETS.includes(s)) ?? "";
      const range = rangeFromBucket(bucket);
      const host = value.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

      // Persist a real, full ICP profile so it's reusable everywhere — not just the agent.
      let profileId: string | null = null;
      const profileName = `Website ICP — ${host}`;
      try {
        const created: any = await createProfile.mutateAsync({
          name: profileName,
          target_titles: titles,
          industries,
          geographies: locations,
          intent_keywords: keywords,
          company_size_min: range.min,
          company_size_max: range.max,
          notes: data?.summary ?? null,
        } as any);
        profileId = created?.id ?? null;
      } catch {
        // Non-fatal: still apply targeting even if saving the profile failed.
      }

      const snapshot: ICPSnapshot = {
        profile_id: profileId,
        name: profileName,
        source: "website",
        source_domain: host,
        target_titles: titles,
        industries,
        geographies: locations,
        company_size_min: range.min,
        company_size_max: range.max,
        company_size_bucket: bucket,
        departments: [],
        seniority_levels: [],
        tech_stack: [],
        buying_signals: [],
        intent_keywords: keywords,
        event_triggers: [],
        hiring_signals: [],
        competitor_tools: [],
        pain_points: [],
        use_cases: [],
        objections: [],
        success_metrics: [],
        value_proposition: null,
        customer_examples: null,
        disqualifiers: null,
        exclude_industries: [],
        exclude_titles: [],
        exclude_keywords: [],
        notes: data?.summary ?? null,
        summary: data?.summary ?? null,
        captured_at: new Date().toISOString(),
      };

      if (profileId) setSelectedId(profileId);
      onApply(targetingFromSnapshot(snapshot), snapshot);
      toast.success(
        data?.summary
          ? `Full ICP built from ${host}: ${data.summary}`
          : `Full ICP built from ${host}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Analysis failed: ${message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Import a full ICP profile so the agent keeps the whole context — titles, industries, signals,
        pain points and exclusions — not just four fields.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Target className="w-3.5 h-3.5" /> Use an existing ICP profile
          </Label>
          <Select value={selectedId} onValueChange={setSelectedId} disabled={isLoading || profiles.length === 0}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  isLoading
                    ? "Loading profiles…"
                    : profiles.length === 0
                      ? "No ICP profiles yet — build one below"
                      : "Select an ICP profile"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleUseProfile} disabled={!selectedId} className="gap-2">
          <Sparkles className="w-4 h-4" />
          Import full ICP
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="icp-domain" className="flex items-center gap-1.5 text-xs">
            <Globe className="w-3.5 h-3.5" /> Or analyze a website to build a full ICP profile
          </Label>
          <Input
            id="icp-domain"
            placeholder="yourcompany.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAnalyze();
              }
            }}
          />
        </div>
        <Button variant="outline" onClick={handleAnalyze} disabled={analyzing} className="gap-2">
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {analyzing ? "Analyzing…" : "Analyze"}
        </Button>
      </div>
    </div>
  );
}
