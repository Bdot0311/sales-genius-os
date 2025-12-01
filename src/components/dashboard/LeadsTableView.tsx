import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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
}

interface LeadsTableViewProps {
  leads: Lead[];
  selectedLeads: string[];
  onSelectLead: (leadId: string) => void;
  onSelectAll: (checked: boolean) => void;
  onLeadClick: (lead: Lead) => void;
}

export const LeadsTableView = ({
  leads,
  selectedLeads,
  onSelectLead,
  onSelectAll,
  onLeadClick,
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
            <TableHead>Industry</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow
              key={lead.id}
              className="cursor-pointer hover:bg-muted/50"
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
              <TableCell>{lead.industry || "—"}</TableCell>
              <TableCell>{lead.company_size || "—"}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
