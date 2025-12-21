import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Zap, TrendingUp, Target, Sparkles, MapPin } from "lucide-react";
import { ExternalLead } from "@/hooks/use-external-leads";

interface ExternalLeadsTableProps {
  leads: ExternalLead[];
  activatingLead: string | null;
  onActivateLead: (lead: ExternalLead) => void;
}

export function ExternalLeadsTable({ leads, activatingLead, onActivateLead }: ExternalLeadsTableProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-emerald-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  const getScoreBadge = (score: number, label: string) => {
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
                    <p className="text-xs text-muted-foreground">{lead.business_email}</p>
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
