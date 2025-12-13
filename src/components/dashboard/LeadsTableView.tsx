import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Globe, CheckCircle, Loader2 } from "lucide-react";

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
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedLeads.length === leads.length && leads.length > 0}
                onCheckedChange={onSelectAll}
              />
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-32">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const isDiscovered = lead.lead_status === 'discovered';
            return (
              <TableRow
                key={lead.id}
                className={`cursor-pointer hover:bg-muted/50 ${isDiscovered ? 'bg-blue-500/5' : ''}`}
                onClick={() => onLeadClick(lead)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedLeads.includes(lead.id)}
                    onCheckedChange={() => onSelectLead(lead.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">{lead.company_name}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm">{lead.contact_name}</div>
                    <div className="text-xs text-muted-foreground">{lead.contact_email}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {isDiscovered ? (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                      <Globe className="w-3 h-3 mr-1" />
                      Discovered
                    </Badge>
                  ) : lead.lead_status === 'archived' ? (
                    <Badge variant="secondary" className="text-xs">Archived</Badge>
                  ) : (
                    <Badge variant="default" className="text-xs">Active</Badge>
                  )}
                </TableCell>
                <TableCell>{lead.industry || "—"}</TableCell>
                <TableCell>
                  <Badge variant={getScoreColor(lead.icp_score)}>
                    {lead.icp_score || 0}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{lead.source || "Unknown"}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
