import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Deal {
  id: string;
  title: string;
  company_name: string;
  value: number;
  probability: number;
  stage: string;
}

interface PipelineColumnProps {
  title: string;
  deals: Deal[];
  totalValue: number;
  color: string;
  onMoveDeal: (dealId: string, stage: string) => void;
  stages: Array<{ name: string; key: string; color: string }>;
}

export const PipelineColumn = ({ title, deals, totalValue, color, onMoveDeal, stages }: PipelineColumnProps) => {
  return (
    <div className="flex-shrink-0 w-80">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {deals.length} deals • ${totalValue.toLocaleString()}
          </p>
        </div>
        <div className={`w-3 h-3 rounded-full ${color}`} />
      </div>

      <div className="space-y-3">
        {deals.map((deal) => (
          <Card
            key={deal.id}
            className="p-4 bg-card border-border hover:border-primary/50 transition-all duration-300 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-medium mb-1">{deal.title}</h4>
                <p className="text-sm text-muted-foreground">{deal.company_name}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  {stages.map((stage) => (
                    <DropdownMenuItem 
                      key={stage.key}
                      onClick={() => onMoveDeal(deal.id, stage.key)}
                    >
                      Move to {stage.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary">
                ${deal.value.toLocaleString()}
              </span>
              <Badge variant="secondary" className="text-xs">
                {deal.probability}% likely
              </Badge>
            </div>
          </Card>
        ))}

        {deals.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No deals in this stage
          </div>
        )}
      </div>
    </div>
  );
};
