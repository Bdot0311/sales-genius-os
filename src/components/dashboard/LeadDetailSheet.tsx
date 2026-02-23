import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Building2, Mail, Phone, Globe, Linkedin, Briefcase, Users, DollarSign, Code, Calendar, Sparkles, Pencil, Save, X } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  industry: string | null;
  company_size: string | null;
  source: string | null;
  notes: string | null;
  icp_score: number | null;
  created_at: string;
  linkedin_url: string | null;
  job_title: string | null;
  department: string | null;
  seniority: string | null;
  company_website: string | null;
  company_linkedin: string | null;
  company_description: string | null;
  employee_count: string | null;
  annual_revenue: string | null;
  technologies: string[] | null;
  enriched_at: string | null;
  enrichment_status: string | null;
}

interface EnrichmentHistory {
  id: string;
  enriched_at: string;
  fields_enriched: string[];
  source: string;
  status: string;
}

interface LeadDetailSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrichmentHistory?: EnrichmentHistory[];
  onEnrich?: () => void;
  isEnriching?: boolean;
  onSave?: (leadId: string, updates: Partial<Lead>) => Promise<void>;
}

type EditableFields = {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  linkedin_url: string;
  job_title: string;
  department: string;
  seniority: string;
  company_name: string;
  company_website: string;
  company_linkedin: string;
  industry: string;
  employee_count: string;
  annual_revenue: string;
  company_description: string;
  notes: string;
  technologies: string;
};

function buildEditableFields(lead: Lead): EditableFields {
  return {
    contact_name: lead.contact_name || "",
    contact_email: lead.contact_email || "",
    contact_phone: lead.contact_phone || "",
    linkedin_url: lead.linkedin_url || "",
    job_title: lead.job_title || "",
    department: lead.department || "",
    seniority: lead.seniority || "",
    company_name: lead.company_name || "",
    company_website: lead.company_website || "",
    company_linkedin: lead.company_linkedin || "",
    industry: lead.industry || "",
    employee_count: lead.employee_count || "",
    annual_revenue: lead.annual_revenue || "",
    company_description: lead.company_description || "",
    notes: lead.notes || "",
    technologies: (lead.technologies || []).join(", "),
  };
}

function EditField({ label, icon: Icon, value, onChange, type = "text", multiline = false }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-muted-foreground mt-2.5" />
      <div className="flex-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {multiline ? (
          <Textarea value={value} onChange={e => onChange(e.target.value)} className="mt-1 text-sm" rows={3} />
        ) : (
          <Input value={value} onChange={e => onChange(e.target.value)} type={type} className="mt-1 h-8 text-sm" />
        )}
      </div>
    </div>
  );
}

export const LeadDetailSheet = ({ 
  lead, 
  open, 
  onOpenChange, 
  enrichmentHistory = [],
  onEnrich,
  isEnriching = false,
  onSave,
}: LeadDetailSheetProps) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<EditableFields>(() => lead ? buildEditableFields(lead) : {} as EditableFields);

  // Sync fields when lead changes
  const [prevLeadId, setPrevLeadId] = useState<string | null>(null);
  if (lead && lead.id !== prevLeadId) {
    setPrevLeadId(lead.id);
    setFields(buildEditableFields(lead));
    setEditing(false);
  }

  if (!lead) return null;

  const updateField = (key: keyof EditableFields, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const techArray = fields.technologies
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      await onSave(lead.id, {
        contact_name: fields.contact_name.trim() || lead.contact_name,
        contact_email: fields.contact_email.trim() || null,
        contact_phone: fields.contact_phone.trim() || null,
        linkedin_url: fields.linkedin_url.trim() || null,
        job_title: fields.job_title.trim() || null,
        department: fields.department.trim() || null,
        seniority: fields.seniority.trim() || null,
        company_name: fields.company_name.trim() || lead.company_name,
        company_website: fields.company_website.trim() || null,
        company_linkedin: fields.company_linkedin.trim() || null,
        industry: fields.industry.trim() || null,
        employee_count: fields.employee_count.trim() || null,
        annual_revenue: fields.annual_revenue.trim() || null,
        company_description: fields.company_description.trim() || null,
        notes: fields.notes.trim() || null,
        technologies: techArray.length > 0 ? techArray : null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFields(buildEditableFields(lead));
    setEditing(false);
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "secondary";
    if (score >= 80) return "default";
    if (score >= 50) return "secondary";
    return "destructive";
  };

  const getEnrichmentStatusBadge = (status: string | null) => {
    if (!status || status === 'pending') return <Badge variant="outline">Not Enriched</Badge>;
    if (status === 'enriched') return <Badge variant="default">Enriched</Badge>;
    if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-2xl">{lead.company_name}</SheetTitle>
              <p className="text-muted-foreground mt-1">{lead.contact_name}</p>
            </div>
            <div className="flex items-center gap-2">
              {getEnrichmentStatusBadge(lead.enrichment_status)}
              {lead.icp_score !== null && (
                <Badge variant={getScoreColor(lead.icp_score)}>
                  Score: {lead.icp_score}
                </Badge>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Action Buttons */}
          <div className="flex gap-2">
            {onEnrich && (
              <Button 
                onClick={onEnrich} 
                disabled={isEnriching || editing}
                variant="hero"
                className="flex-1"
              >
                {isEnriching ? (
                  <><Sparkles className="w-4 h-4 mr-2 animate-spin" />Enriching...</>
                ) : lead.enrichment_status === 'enriched' ? (
                  <><Sparkles className="w-4 h-4 mr-2" />Re-Enrich Lead</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" />Enrich Lead Data</>
                )}
              </Button>
            )}
            {onSave && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)} className={onEnrich && lead.enrichment_status !== 'enriched' ? "" : "flex-1"}>
                <Pencil className="w-4 h-4 mr-2" />Edit
              </Button>
            )}
            {editing && (
              <>
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />{saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  <X className="w-4 h-4 mr-2" />Cancel
                </Button>
              </>
            )}
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Mail className="w-4 h-4" />Contact Information
            </h3>
            {editing ? (
              <div className="space-y-3">
                <EditField label="Name" icon={Briefcase} value={fields.contact_name} onChange={v => updateField("contact_name", v)} />
                <EditField label="Email" icon={Mail} value={fields.contact_email} onChange={v => updateField("contact_email", v)} type="email" />
                <EditField label="Phone" icon={Phone} value={fields.contact_phone} onChange={v => updateField("contact_phone", v)} type="tel" />
                <EditField label="LinkedIn URL" icon={Linkedin} value={fields.linkedin_url} onChange={v => updateField("linkedin_url", v)} type="url" />
                <EditField label="Job Title" icon={Briefcase} value={fields.job_title} onChange={v => updateField("job_title", v)} />
                <EditField label="Department" icon={Building2} value={fields.department} onChange={v => updateField("department", v)} />
                <EditField label="Seniority" icon={Users} value={fields.seniority} onChange={v => updateField("seniority", v)} />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {lead.contact_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <a href={`mailto:${lead.contact_email}`} className="text-primary hover:underline">{lead.contact_email}</a>
                  </div>
                )}
                {lead.contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <a href={`tel:${lead.contact_phone}`} className="text-primary hover:underline">{lead.contact_phone}</a>
                  </div>
                )}
                {lead.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <Linkedin className="w-4 h-4 text-muted-foreground" />
                    <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">LinkedIn Profile</a>
                  </div>
                )}
                {lead.job_title && (
                  <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><span>{lead.job_title}</span></div>
                )}
                {lead.department && (
                  <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span>{lead.department} {lead.seniority && `(${lead.seniority})`}</span></div>
                )}
                {!lead.contact_email && !lead.contact_phone && !lead.linkedin_url && !lead.job_title && !lead.department && (
                  <p className="text-muted-foreground italic">No contact info yet. Click Edit to add.</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Company Information */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" />Company Information</h3>
            {editing ? (
              <div className="space-y-3">
                <EditField label="Company Name" icon={Building2} value={fields.company_name} onChange={v => updateField("company_name", v)} />
                <EditField label="Website" icon={Globe} value={fields.company_website} onChange={v => updateField("company_website", v)} type="url" />
                <EditField label="Company LinkedIn" icon={Linkedin} value={fields.company_linkedin} onChange={v => updateField("company_linkedin", v)} type="url" />
                <EditField label="Industry" icon={Briefcase} value={fields.industry} onChange={v => updateField("industry", v)} />
                <EditField label="Employee Count" icon={Users} value={fields.employee_count} onChange={v => updateField("employee_count", v)} />
                <EditField label="Annual Revenue" icon={DollarSign} value={fields.annual_revenue} onChange={v => updateField("annual_revenue", v)} />
                <EditField label="Description" icon={Building2} value={fields.company_description} onChange={v => updateField("company_description", v)} multiline />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {lead.company_website && (
                  <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" /><a href={lead.company_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lead.company_website}</a></div>
                )}
                {lead.company_linkedin && (
                  <div className="flex items-center gap-2"><Linkedin className="w-4 h-4 text-muted-foreground" /><a href={lead.company_linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Company LinkedIn</a></div>
                )}
                {lead.industry && (
                  <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><span>{lead.industry}</span></div>
                )}
                {lead.employee_count && (
                  <div className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /><span>{lead.employee_count} employees</span></div>
                )}
                {lead.annual_revenue && (
                  <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-muted-foreground" /><span>{lead.annual_revenue} revenue</span></div>
                )}
                {lead.company_description && <p className="text-muted-foreground mt-2">{lead.company_description}</p>}
                {!lead.company_website && !lead.company_linkedin && !lead.industry && !lead.employee_count && !lead.annual_revenue && !lead.company_description && (
                  <p className="text-muted-foreground italic">No company info yet. Click Edit to add.</p>
                )}
              </div>
            )}
          </div>

          {/* Technologies */}
          {editing ? (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Code className="w-4 h-4" />Technologies</h3>
                <EditField label="Comma-separated list" icon={Code} value={fields.technologies} onChange={v => updateField("technologies", v)} />
              </div>
            </>
          ) : lead.technologies && lead.technologies.length > 0 ? (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Code className="w-4 h-4" />Technologies</h3>
                <div className="flex flex-wrap gap-2">
                  {lead.technologies.map((tech, idx) => (
                    <Badge key={idx} variant="outline">{tech}</Badge>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {/* Notes */}
          {editing ? (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Notes</h3>
                <Textarea value={fields.notes} onChange={e => updateField("notes", e.target.value)} rows={4} className="text-sm" />
              </div>
            </>
          ) : lead.notes ? (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
              </div>
            </>
          ) : null}

          {enrichmentHistory.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" />Enrichment History</h3>
                <div className="space-y-3">
                  {enrichmentHistory.map((entry) => (
                    <div key={entry.id} className="text-sm border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={entry.status === 'success' ? 'default' : 'destructive'}>{entry.status}</Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(entry.enriched_at), 'PPp')}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Source: {entry.source}</div>
                      {entry.fields_enriched.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.fields_enriched.map((field, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">{field}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Metadata */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Added: {format(new Date(lead.created_at), 'PPp')}</div>
            {lead.enriched_at && <div>Last Enriched: {format(new Date(lead.enriched_at), 'PPp')}</div>}
            {lead.source && <div>Source: {lead.source}</div>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
