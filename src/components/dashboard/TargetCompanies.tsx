import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Loader2, X, Search, Plus } from "lucide-react";
import { ExternalLeadFilters } from "@/hooks/use-external-leads";
import { normalizeDomain, isValidDomain } from "@/lib/lead-filters";

interface CompanyCandidate {
  id_or_domain: string;
  name: string;
  domain: string;
  location?: string;
  employee_range?: string;
}

interface TargetCompaniesProps {
  onFindLeads: (filters: Pick<ExternalLeadFilters, "companies" | "job_title">, label: string) => void;
  isSearching: boolean;
}

const MAX_COMPANIES = 10;

export const TargetCompanies = ({ onFindLeads, isSearching }: TargetCompaniesProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<CompanyCandidate[]>([]);
  const [jobTitle, setJobTitle] = useState("");

  const reqId = useRef(0);
  const atCap = selected.length >= MAX_COMPANIES;

  // Debounced company search-as-you-type.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || atCap) {
      setResults([]);
      setSearched(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("search-companies", { body: { query: q } });
        if (id !== reqId.current) return; // a newer keystroke superseded this one
        setResults(Array.isArray(data?.companies) ? data.companies : []);
        setSearched(true);
      } catch {
        if (id !== reqId.current) return;
        setResults([]);
        setSearched(true);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, atCap]);

  const addCompany = (c: CompanyCandidate) => {
    if (atCap || selected.some((s) => s.id_or_domain.toLowerCase() === c.id_or_domain.toLowerCase())) return;
    setSelected((prev) => [...prev, c]);
    setQuery("");
    setResults([]);
    setSearched(false);
  };

  const removeCompany = (key: string) => setSelected((prev) => prev.filter((s) => s.id_or_domain !== key));

  // If the user typed a bare domain, let them add it directly.
  const typedDomain = isValidDomain(query) ? normalizeDomain(query) : null;

  const handleFind = () => {
    onFindLeads(
      {
        companies: selected.map((c) => ({ name: c.name || undefined, domain: c.domain || undefined })),
        job_title: jobTitle.trim() || undefined,
      },
      selected.length === 1 ? selected[0].name : `${selected.length} companies`,
    );
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <CardContent className="p-6 space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Target companies</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Search the companies you want to sell into, add them to your list, then find contacts at those accounts.
          </p>
        </div>

        {/* Selected companies */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((c) => (
              <Badge key={c.id_or_domain} variant="secondary" className="gap-1 text-xs">
                {c.name}
                {c.domain && <span className="text-muted-foreground">· {c.domain}</span>}
                <button type="button" onClick={() => removeCompany(c.id_or_domain)}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground self-center">
              {selected.length}/{MAX_COMPANIES}
            </span>
          </div>
        )}

        {/* Company search */}
        {!atCap && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a company name or paste a domain..."
                className="pl-9"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {/* Results */}
            {(results.length > 0 || typedDomain || (searched && !searching)) && (
              <div className="rounded-lg border border-border/60 divide-y divide-border/40 overflow-hidden">
                {typedDomain && !results.some((r) => r.domain === typedDomain) && (
                  <button
                    type="button"
                    onClick={() => addCompany({ id_or_domain: typedDomain, name: typedDomain, domain: typedDomain })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                  >
                    <Plus className="w-4 h-4 text-primary shrink-0" />
                    Add domain <span className="font-medium">{typedDomain}</span>
                  </button>
                )}
                {results.map((c) => (
                  <button
                    key={c.id_or_domain}
                    type="button"
                    onClick={() => addCompany(c)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{c.name}</span>
                      {c.domain && <span className="text-muted-foreground"> · {c.domain}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {[c.location, c.employee_range].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
                {searched && !searching && results.length === 0 && !typedDomain && (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    We couldn't find that company. Check the spelling or try their website domain.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Optional role filter */}
        <div className="space-y-1.5">
          <Label className="text-xs">Filter by role (optional)</Label>
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. VP Sales, Head of Marketing"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Narrowing by role gets better results — large companies have hundreds of contacts.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <Button onClick={handleFind} variant="hero" disabled={selected.length === 0 || isSearching}>
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Find leads
          </Button>
          {selected.length === 0 && <p className="text-xs text-muted-foreground">Add at least one company to search.</p>}
        </div>
      </CardContent>
    </Card>
  );
};
