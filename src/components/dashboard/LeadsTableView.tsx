import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Globe, CheckCircle, Loader2 } from "lucide-react";
import { ICPScoreBreakdown } from "./ICPScoreBreakdown";

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  industry?: string;
  company_size?: string;
  source?: string;
  notes?: string;
  icp_score?: number;
  created_at: string;
  updated_at?: string;
  user_id?: string;
  last_contacted_at?: string;
  score_changed_at?: string;
  lead_status?: string;
}

interface LeadsTableViewProps {
  leads: Lead[];
  selectedLeads: string[];
  onSelectLead: (leadId: string) => void;
  onSelectAll: (checked: boolean) => void;
  onLeadClick: (lead: Lead) => void;
  onActivateLead?: (leadId: string) => void;
  activatingLead?: string | null;
}

export const LeadsTableView = ({
  leads,
  selectedLeads,
  onSelectLead,
  onSelectAll,
  onLeadClick,
  onActivateLead,
  activatingLead,
}: LeadsTableViewProps) => {
  const getScoreColor = (score: number | null) => {
    if (!score) return "secondary";
    if (score >= 80) return "default";
    if (score >= 50) return "secondary";
    return "outline";
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4 w-12">
              <Checkbox
                checked={selectedLeads.length === leads.length && leads.length > 0}
                onCheckedChange={onSelectAll}
              />
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Company</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Contact</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Status</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Industry</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Score</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Source</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4">Added</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium py-2.5 px-4 w-32">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const isDiscovered = lead.lead_status === 'discovered';
            return (
              <TableRow
                key={lead.id}
                className={`border-b border-border/40 hover:bg-accent/30 transition-colors cursor-pointer group ${isDiscovered ? 'bg-blue-500/[0.03]' : ''}`}
                onClick={() => onLeadClick(lead)}
              >
                <TableCell className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedLeads.includes(lead.id)}
                    onCheckedChange={() => onSelectLead(lead.id)}
                  />
                </TableCell>
                <TableCell className="py-3 px-4 font-medium text-sm">{lead.company_name}</TableCell>
                <TableCell className="py-3 px-4">
                  <div className="space-y-1">
                    <div className="text-sm">{lead.contact_name}</div>
                    <div className="text-xs text-muted-foreground">{lead.contact_email}</div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-4">
                  {isDiscovered ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-400">
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      Discovered
                    </span>
                  ) : lead.lead_status === 'archived' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                      Archived
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      Active
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-3 px-4">{lead.industry || "—"}</TableCell>
                <TableCell className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  <ICPScoreBreakdown lead={lead} score={lead.icp_score} />
                </TableCell>
                <TableCell className="py-3 px-4"><span className="text-xs text-muted-foreground">{lead.source || "—"}</span></TableCell>
                <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="py-3 px-4 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  {isDiscovered && onActivateLead ? (
                    <Button
                      variant="hero"
                      size="sm"
                      onClick={() => onActivateLead(lead.id)}
                      disabled={activatingLead === lead.id}
                    >
                      {activatingLead === lead.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
