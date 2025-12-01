import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Building2, Mail, Phone, Globe, Linkedin, Briefcase, Users, DollarSign, Code, Calendar, Sparkles } from "lucide-react";
import { format } from "date-fns";

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
}

export const LeadDetailSheet = ({ 
  lead, 
  open, 
  onOpenChange, 
  enrichmentHistory = [],
  onEnrich,
  isEnriching = false
}: LeadDetailSheetProps) => {
  if (!lead) return null;

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
          {/* Enrichment Action */}
          {onEnrich && lead.enrichment_status !== 'enriched' && (
            <Button 
              onClick={onEnrich} 
              disabled={isEnriching}
              variant="hero"
              className="w-full"
            >
              {isEnriching ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                  Enriching...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Enrich Lead Data
                </>
              )}
            </Button>
          )}

          {/* Contact Information */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Contact Information
            </h3>
            <div className="space-y-2 text-sm">
              {lead.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <a href={`mailto:${lead.contact_email}`} className="text-primary hover:underline">
                    {lead.contact_email}
                  </a>
                </div>
              )}
              {lead.contact_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a href={`tel:${lead.contact_phone}`} className="text-primary hover:underline">
                    {lead.contact_phone}
                  </a>
                </div>
              )}
              {lead.linkedin_url && (
                <div className="flex items-center gap-2">
                  <Linkedin className="w-4 h-4 text-muted-foreground" />
                  <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    LinkedIn Profile
                  </a>
                </div>
              )}
              {lead.job_title && (
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.job_title}</span>
                </div>
              )}
              {lead.department && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.department} {lead.seniority && `(${lead.seniority})`}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Company Information */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company Information
            </h3>
            <div className="space-y-2 text-sm">
              {lead.company_website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <a href={lead.company_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {lead.company_website}
                  </a>
                </div>
              )}
              {lead.company_linkedin && (
                <div className="flex items-center gap-2">
                  <Linkedin className="w-4 h-4 text-muted-foreground" />
                  <a href={lead.company_linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Company LinkedIn
                  </a>
                </div>
              )}
              {lead.industry && (
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.industry}</span>
                </div>
              )}
              {lead.employee_count && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.employee_count} employees</span>
                </div>
              )}
              {lead.annual_revenue && (
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.annual_revenue} revenue</span>
                </div>
              )}
              {lead.company_description && (
                <p className="text-muted-foreground mt-2">{lead.company_description}</p>
              )}
            </div>
          </div>

          {lead.technologies && lead.technologies.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Technologies
                </h3>
                <div className="flex flex-wrap gap-2">
                  {lead.technologies.map((tech, idx) => (
                    <Badge key={idx} variant="outline">{tech}</Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {lead.notes && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
              </div>
            </>
          )}

          {enrichmentHistory.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Enrichment History
                </h3>
                <div className="space-y-3">
                  {enrichmentHistory.map((entry) => (
                    <div key={entry.id} className="text-sm border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={entry.status === 'success' ? 'default' : 'destructive'}>
                          {entry.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.enriched_at), 'PPp')}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Source: {entry.source}
                      </div>
                      {entry.fields_enriched.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.fields_enriched.map((field, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {field}
                            </Badge>
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
            {lead.enriched_at && (
              <div>Last Enriched: {format(new Date(lead.enriched_at), 'PPp')}</div>
            )}
            {lead.source && <div>Source: {lead.source}</div>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};