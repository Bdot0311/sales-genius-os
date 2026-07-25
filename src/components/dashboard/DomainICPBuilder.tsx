import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Globe, Sparkles, X, AlertCircle, ArrowLeft, Search, Info } from "lucide-react";
import { ParsedIcpFilters, normalizeDomain } from "@/lib/lead-filters";

interface DomainICPBuilderProps {
  onFindLeads: (filters: ParsedIcpFilters, label: string) => void;
  onSwitchToDescribe: () => void;
  isSearching: boolean;
}

const SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

// Small inline chip editor — add on Enter, remove with X. No new deps.
function ChipField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 text-xs">
              {tag}
              <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}

export const DomainICPBuilder = ({ onFindLeads, onSwitchToDescribe, isSearching }: DomainICPBuilderProps) => {
  const [domain, setDomain] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "review" | "error">("idle");
  const [loadingStage, setLoadingStage] = useState<"reading" | "building">("reading");
  const [errorMsg, setErrorMsg] = useState("");
  const [errorRecoverable, setErrorRecoverable] = useState(false);

  // Editable review state
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [lowConfidence, setLowConfidence] = useState(false);
  const [analyzedDomain, setAnalyzedDomain] = useState("");

  const stageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (stageTimer.current) clearTimeout(stageTimer.current); }, []);

  const handleBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeDomain(domain);
    if (!normalized) {
      setInputError("Enter a valid website, e.g. acme.com");
      return;
    }
    setInputError(null);
    setPhase("loading");
    setLoadingStage("reading");
    stageTimer.current = setTimeout(() => setLoadingStage("building"), 4000);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-domain", {
        body: { domain: normalized },
      });
      if (stageTimer.current) clearTimeout(stageTimer.current);

      if (error) throw error;

      if (data?.error) {
        setErrorMsg(data.error);
        // Unreachable / empty content → offer the manual describe fallback.
        setErrorRecoverable(["unreachable", "empty_content", "invalid_domain"].includes(data.error_code));
        setPhase("error");
        return;
      }

      const f = (data?.filters || {}) as ParsedIcpFilters;
      setJobTitles(f.jobTitles || []);
      setIndustries(f.industries || []);
      setCompanySizes((f.companySizes || []).filter((s) => SIZE_BUCKETS.includes(s)));
      setLocations(f.locations || []);
      setKeywords(f.keywords || []);
      setSummary(data?.summary || "");
      setLowConfidence(Boolean(data?.low_confidence));
      setAnalyzedDomain(normalized);
      setPhase("review");
    } catch (err) {
      if (stageTimer.current) clearTimeout(stageTimer.current);
      setErrorMsg("We couldn't analyze that site right now. Try again or describe your ICP manually.");
      setErrorRecoverable(true);
      setPhase("error");
    }
  };

  const toggleSize = (bucket: string) => {
    setCompanySizes((prev) => (prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket]));
  };

  const reset = () => {
    setPhase("idle");
    setDomain("");
    setInputError(null);
  };

  const handleFind = () => {
    onFindLeads(
      { jobTitles, industries, companySizes, locations, keywords, limit: 50 },
      analyzedDomain,
    );
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <CardContent className="p-6">
        {/* ─── Input ─────────────────────────────── */}
        {(phase === "idle" || phase === "loading") && (
          <form onSubmit={handleBuild} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Analyze your website</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste your site and we'll build an ICP of who you should sell to. Review it, then find leads.
              </p>
              <div className="flex gap-2">
                <Input
                  value={domain}
                  onChange={(e) => { setDomain(e.target.value); if (inputError) setInputError(null); }}
                  placeholder="acme.com"
                  disabled={phase === "loading"}
                  aria-invalid={!!inputError}
                />
                <Button type="submit" variant="hero" disabled={!domain.trim() || phase === "loading"} className="shrink-0">
                  {phase === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {phase === "loading" ? "" : "Build my ICP"}
                </Button>
              </div>
              {inputError && <p className="text-xs text-destructive">{inputError}</p>}
            </div>

            {phase === "loading" && (
              <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground border-t border-border/50">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{loadingStage === "reading" ? "Reading your site..." : "Building your ICP..."}</span>
              </div>
            )}
          </form>
        )}

        {/* ─── Error ─────────────────────────────── */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{errorMsg}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                <ArrowLeft className="w-4 h-4 mr-2" />Try another site
              </Button>
              {errorRecoverable && (
                <Button variant="ghost" size="sm" onClick={onSwitchToDescribe}>
                  Describe your ICP manually instead
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ─── Review & edit ─────────────────────── */}
        {phase === "review" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Review your ICP</span>
                <Badge variant="outline" className="text-xs font-mono">{analyzedDomain}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Start over</Button>
            </div>

            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

            {lowConfidence && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-600 dark:text-yellow-500">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>We couldn't read much from that site (it may be JavaScript-rendered). Please review these fields carefully before searching.</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <ChipField label="Target job titles" value={jobTitles} onChange={setJobTitles} placeholder="e.g. VP of Sales — Enter" />
              <ChipField label="Industries" value={industries} onChange={setIndustries} placeholder="e.g. SaaS — Enter" />
              <ChipField label="Locations" value={locations} onChange={setLocations} placeholder="e.g. United States — Enter" />
              <ChipField label="Keywords / signals" value={keywords} onChange={setKeywords} placeholder="e.g. hiring SDRs — Enter" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Company size</Label>
              <div className="flex flex-wrap gap-2">
                {SIZE_BUCKETS.map((bucket) => (
                  <Badge
                    key={bucket}
                    variant={companySizes.includes(bucket) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleSize(bucket)}
                  >
                    {bucket}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <Button onClick={handleFind} variant="hero" disabled={isSearching}>
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                Find leads
              </Button>
              <p className="text-xs text-muted-foreground">Uses the same lead search as every other flow.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
