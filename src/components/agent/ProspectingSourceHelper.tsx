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

interface Props {
  onApply: (t: ProspectingTargeting) => void;
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

function fromProfile(p: ICPProfile): ProspectingTargeting {
  return {
    jobTitle: (p.target_titles || [])[0] ?? "",
    industry: (p.industries || [])[0] ?? "",
    country: (p.geographies || [])[0] ?? "",
    companySize: bucketFromRange(p.company_size_min, p.company_size_max),
  };
}

export function ProspectingSourceHelper({ onApply }: Props) {
  const { profiles, isLoading } = useICPProfiles();
  const [selectedId, setSelectedId] = useState("");
  const [domain, setDomain] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const handleUseProfile = () => {
    const profile = profiles.find((p) => p.id === selectedId);
    if (!profile) {
      toast.error("Pick an ICP profile first");
      return;
    }
    onApply(fromProfile(profile));
    toast.success(`Targeting filled from "${profile.name}"`);
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
      const size = (f.companySizes ?? []).find((s: string) => SIZE_BUCKETS.includes(s)) ?? "";
      onApply({
        jobTitle: (f.jobTitles ?? [])[0] ?? "",
        industry: (f.industries ?? [])[0] ?? "",
        country: (f.locations ?? [])[0] ?? "",
        companySize: size,
      });
      toast.success(data?.summary ? `ICP built: ${data.summary}` : "Targeting filled from your website");
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
        Not sure who to target? Pull it from an ICP profile, or let the agent read your website and build one.
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
          Apply
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="icp-domain" className="flex items-center gap-1.5 text-xs">
            <Globe className="w-3.5 h-3.5" /> Or analyze a website to build the ICP
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
