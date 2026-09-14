import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { fieldLabel } from "../../../supabase/functions/_shared/person-match";
import { Loader2, Search, Mail, Phone, Linkedin, Building2, Check } from "lucide-react";

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
  company_linkedin?: string | null;
  industry?: string | null;
  employee_count?: string | null;
  company_description?: string | null;
  country?: string | null;
}

interface ExistingLead {
  id: string;
  contact_name?: string | null;
  company_name?: string | null;
  changes: { field: string; from: string | null; to: string }[];
}

/**
 * Look up one person, then decide what to do with the answer.
 *
 * The lookup used to write into leads on its own, which produced the complaint
 * this replaced: "people search shows a lead I already have, with no email".
 * Two separate faults behind it.
 *
 * The result is assembled with the caller's own input as the last fallback, and
 * a match was declared whenever a name or an email was present — a condition
 * satisfied before the provider is called, because the name is the one that was
 * typed. An empty upstream answer therefore came back as a found contact whose
 * only fields were the two that had been entered, charged a credit, and saved.
 *
 * Then the save was automatic and silent. A lookup that learned nothing said
 * "Saved to leads"; a lookup that learned a great deal said exactly the same;
 * and repeating one on somebody already saved matched their row and wrote the
 * caller's own input over it. There was no way to look without writing.
 *
 * So: a find now has to include something upstream actually contributed, and
 * saving is a button. When the person is already a lead, that button says what
 * it would change.
 */
export const FindPerson = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [foundFields, setFoundFields] = useState<string[]>([]);
  const [existing, setExisting] = useState<ExistingLead | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  const canSubmit =
    !loading &&
    (linkedin.trim().length > 0 ||
      email.trim().length > 0 ||
      (fullName.trim().split(/\s+/).length >= 2 && company.trim().length > 0));

  const handleLookup = async () => {
    setLoading(true);
    setPerson(null);
    setExisting(null);
    setSavedId(null);
    setFoundFields([]);
    setNotFound(null);
    try {
      const { data, error } = await supabase.functions.invoke("find-person", {
        body: {
          action: "lookup",
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
        setFoundFields((data.found_fields ?? []) as string[]);
        setExisting((data.existing_lead ?? null) as ExistingLead | null);
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
    } catch (e: unknown) {
      console.error("find-person failed:", e);
      toast({ title: "Lookup failed", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!person) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("find-person", {
        body: { action: "save", person, lead_id: existing?.id ?? undefined },
      });
      if (error) throw error;
      if (!data?.lead_id) throw new Error(data?.error || "Save failed");
      setSavedId(data.lead_id as string);
      toast({
        title: existing ? "Lead updated" : "Lead saved",
        description: existing
          ? `${existing.changes.length} ${existing.changes.length === 1 ? "field" : "fields"} written to ${existing.contact_name ?? "the lead"}.`
          : `${person.contact_name ?? "Contact"} added to your leads.`,
      });
    } catch (e: unknown) {
      console.error("find-person save failed:", e);
      toast({ title: "Could not save", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const detail = (
    icon: React.ReactNode,
    value: string | null | undefined,
    href?: string | null,
  ) => {
    if (!value) return null;
    const inner = (
      <>
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{value}</span>
      </>
    );
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
        {inner}
      </a>
    ) : (
      <span className="flex min-w-0 items-center gap-2">{inner}</span>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Know who you want to reach but not how? Enter their name and company — or an email or LinkedIn
        profile — and we'll fill in the rest of the contact record.
      </p>

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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Looking up…" : "Find contact details"}
        </Button>
        <span className="text-xs text-muted-foreground">Uses 1 search credit per match. No match, no charge.</span>
      </div>

      {notFound && (
        <p className="rounded-md border border-border/50 p-3 text-sm text-muted-foreground">{notFound}</p>
      )}

      {person && (
        <div className="rounded-lg border border-border/50 bg-background/40">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{person.contact_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[person.job_title, person.company_name].filter(Boolean).join(" · ")}
              </p>
            </div>
            {savedId ? (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {existing ? "Lead updated" : "Saved to leads"}
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-2">
            {detail(<Mail className="h-3.5 w-3.5" />, person.contact_email)}
            {detail(<Phone className="h-3.5 w-3.5" />, person.contact_phone)}
            {detail(<Linkedin className="h-3.5 w-3.5" />, person.linkedin_url ? "LinkedIn profile" : null, person.linkedin_url)}
            {detail(
              <Building2 className="h-3.5 w-3.5" />,
              [person.industry, person.employee_count && `${person.employee_count} employees`]
                .filter(Boolean)
                .join(" · ") || null,
            )}
          </div>

          {/* What the lookup actually contributed. Without this, a find and a
              non-find looked identical: the same card, the same green badge. */}
          {foundFields.length > 0 && !existing && (
            <p className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
              Found {foundFields.map(fieldLabel).join(", ").toLowerCase()}.
            </p>
          )}

          {existing && !savedId && (
            <div className="border-t border-border/40 px-4 py-3">
              {existing.changes.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Already in your leads. Updating writes{" "}
                    <span className="text-foreground">
                      {existing.changes.length} {existing.changes.length === 1 ? "field" : "fields"}
                    </span>
                    :
                  </p>
                  <ul className="mt-2 space-y-1">
                    {existing.changes.map((c) => (
                      <li key={c.field} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="text-muted-foreground">{fieldLabel(c.field)}</span>
                        {c.from ? <span className="text-muted-foreground/60 line-through">{c.from}</span> : null}
                        <span className="text-foreground">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Already in your leads, and this lookup found nothing the record does not already have.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-4 py-3">
            {!savedId && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || (existing !== null && existing.changes.length === 0)}
                className="gap-2"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {existing ? "Update lead data" : "Save as new lead"}
              </Button>
            )}
            {(savedId || existing) && (
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/leads/saved")}>
                View in saved leads
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
