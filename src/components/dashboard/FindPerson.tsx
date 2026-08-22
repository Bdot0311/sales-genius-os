import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { UserSearch, Loader2, Search, Mail, Phone, Linkedin, Building2, CheckCircle2 } from "lucide-react";

interface FoundPerson {
  id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  job_title?: string | null;
  seniority?: string | null;
  linkedin_url?: string | null;
  company_name?: string | null;
  company_website?: string | null;
  industry?: string | null;
  employee_count?: string | null;
  country?: string | null;
}

export const FindPerson = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [loading, setLoading] = useState(false);
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  const canSubmit =
    !loading &&
    (linkedin.trim().length > 0 ||
      email.trim().length > 0 ||
      (fullName.trim().split(/\s+/).length >= 2 && company.trim().length > 0));

  const handleLookup = async () => {
    setLoading(true);
    setPerson(null);
    setNotFound(null);
    try {
      const { data, error } = await supabase.functions.invoke("find-person", {
        body: {
          full_name: fullName.trim() || undefined,
          company: company.trim() || undefined,
          company_domain: company.includes(".") ? company.trim() : undefined,
          email: email.trim() || undefined,
          linkedin_url: linkedin.trim() || undefined,
        },
      });
      if (error) throw error;

      if (data?.person) {
        setPerson(data.person as FoundPerson);
      } else {
        setNotFound(data?.error || "No matching contact found.");
        if (data?.error_code === "free_tier_blocked" || data?.error_code === "credits_exhausted") {
          toast({
            title: data.error_code === "free_tier_blocked" ? "Upgrade required" : "Out of credits",
            description: data.error,
            variant: "destructive",
          });
        }
      }
    } catch (e: any) {
      console.error("find-person failed:", e);
      toast({ title: "Lookup failed", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <CardContent className="p-6 space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserSearch className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Find a person</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Know who you want to reach but not how? Enter their name and company — or an email or LinkedIn
            profile — and we'll fill in the rest of the contact record.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fp-name" className="text-xs">Full name</Label>
            <Input
              id="fp-name"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleLookup()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-company" className="text-xs">Company or domain</Label>
            <Input
              id="fp-company"
              placeholder="Acme Inc or acme.com"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleLookup()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-email" className="text-xs">Work email (optional)</Label>
            <Input
              id="fp-email"
              placeholder="jane@acme.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-linkedin" className="text-xs">LinkedIn profile (optional)</Label>
            <Input
              id="fp-linkedin"
              placeholder="linkedin.com/in/janedoe"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleLookup} disabled={!canSubmit} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Looking up…" : "Find contact details"}
          </Button>
          <span className="text-xs text-muted-foreground">Uses 1 search credit per match. No match, no charge.</span>
        </div>

        {notFound && (
          <p className="text-sm text-muted-foreground border border-border rounded-md p-3">{notFound}</p>
        )}

        {person && (
          <div className="rounded-lg border border-primary/30 bg-background/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{person.contact_name}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {[person.job_title, person.company_name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Badge variant="secondary" className="gap-1 shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Saved to leads
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              {person.contact_email && (
                <span className="flex items-center gap-2 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{person.contact_email}</span>
                </span>
              )}
              {person.contact_phone && (
                <span className="flex items-center gap-2 min-w-0">
                  <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{person.contact_phone}</span>
                </span>
              )}
              {person.linkedin_url && (
                <a
                  href={person.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 min-w-0 hover:underline"
                >
                  <Linkedin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">LinkedIn profile</span>
                </a>
              )}
              {(person.industry || person.employee_count) && (
                <span className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">
                    {[person.industry, person.employee_count && `${person.employee_count} employees`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/leads/saved")}>
              View in saved leads
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
