import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Zap, TrendingUp, Target, Sparkles, MapPin, AlertTriangle } from "lucide-react";
import { ExternalLead } from "@/hooks/use-external-leads";

interface ExternalLeadsTableProps {
  leads: ExternalLead[];
  activatingLead: string | null;
  onActivateLead: (lead: ExternalLead) => void;
}

/**
 * What this record is missing, named rather than scored.
 *
 * The provider waterfall returns whatever each vendor happens to hold, so a
 * thin record and a complete one looked identical in this list. "Data 34" says
 * nothing you can act on; "No email · No LinkedIn" tells you why this lead is
 * cheaper to skip than to chase.
 *
 * Deliberately a badge and not a filter: a lead with no email but a real
 * LinkedIn profile is still worth having, and it was already paid for.
 */
const DataGaps = ({ lead }: { lead: ExternalLead }) => {
  const gaps: string[] = [];
  if (!lead.business_email) gaps.push("No email");
  if (!lead.linkedin_url) gaps.push("No LinkedIn");
  if (!lead.company_domain) gaps.push("No website");

  // A mismatch is not a gap — both fields are present but disagree, which means
  // one of them was likely stitched on from a different record.
  const mismatch = lead.email_domain_mismatch === true;
  if (gaps.length === 0 && !mismatch) return null;

  const pill = "gap-1 border-amber-500/40 text-amber-500 text-[10px] px-1.5 py-0";
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {gaps.length > 0 && (
        <Badge variant="outline" className={pill}>
          <AlertTriangle className="w-2.5 h-2.5" />
          {gaps.join(" · ")}
        </Badge>
      )}
      {mismatch && (
        <Badge
          variant="outline"
          className={pill}
          title="The email address and the company website are on different domains. One of them may have come from a different record."
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          Email/site mismatch
        </Badge>
      )}
    </div>
  );
};

export function ExternalLeadsTable({ leads, activatingLead, onActivateLead }: ExternalLeadsTableProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-emerald-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  // A null score is not zero. Intent is null in search because it is measured
  // from fired signals and an unresearched lead has none; ICP fit is null when
  // the user has stated no ICP. Both mean "not measured", and printing a number
  // for either would be a claim nobody made.
  const getScoreBadge = (score: number | null | undefined, label: string) => {
    if (score == null) {
      return (
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-muted" />
          <span className="text-xs text-muted-foreground">
            {label}: <span title={label === 'Intent'
              ? 'measured once the lead is saved and enriched'
              : 'set an ICP to score fit'}>—</span>
          </span>
        </div>
      );
    }
    const color = getScoreColor(score);
    return (
      <div className="flex items-center gap-1">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs text-muted-foreground">{label}: {score}</span>
      </div>
    );
  };

  const getBuyingSignalIcon = (signal: string) => {
    switch (signal) {
      case 'Decision Maker':
        return <Target className="w-3 h-3" />;
      case 'Budget Authority':
        return <TrendingUp className="w-3 h-3" />;
      case 'Growth Stage':
        return <Zap className="w-3 h-3" />;
      default:
        return <Sparkles className="w-3 h-3" />;
    }
  };

  if (leads.length === 0) {
    return null;
  }

  return (
    <ScanResultsGate resultCount={leads.length} scanContext={{ result_count: leads.length }}>
    <div className="border rounded-lg overflow-hidden">
      <Table>

        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Name</TableHead>
            <TableHead>Job Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Lead Score</TableHead>
            <TableHead>Buying Signals</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead, index) => {
            const leadKey = `${lead.company_domain}-${lead.contact_name}`;
            const isActivating = activatingLead === leadKey;
            
            return (
              <TableRow key={`${leadKey}-${index}`} className="hover:bg-muted/30">
                <TableCell>
                  <div>
                    <p className="font-medium">{lead.contact_name}</p>
                    {lead.business_email
                      ? <p className="text-xs text-muted-foreground">{lead.business_email}</p>
                      : <p className="text-xs text-amber-500">No email found</p>}
                    <DataGaps lead={lead} />
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{lead.job_title}</span>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{lead.company_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.company_size} employees • {lead.industry}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {lead.country}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`px-2 py-1 rounded text-xs font-bold text-white ${getScoreColor(lead.scores.overall_score)}`}>
                        {lead.scores.overall_score}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {getScoreBadge(lead.scores.icp_score, 'ICP')}
                      {getScoreBadge(lead.scores.intent_score, 'Intent')}
                      {getScoreBadge(lead.scores.enrichment_score, 'Data')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                      {lead.score_explanation}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {lead.buying_signals.map((signal, i) => (
                      <Badge 
                        key={i} 
                        variant="outline" 
                        className="text-xs flex items-center gap-1 bg-primary/5 border-primary/20"
                      >
                        {getBuyingSignalIcon(signal)}
                        {signal}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="hero"
                    size="sm"
                    onClick={() => onActivateLead(lead)}
                    disabled={isActivating}
                  >
                    {isActivating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enriching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Enrich & Save
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
