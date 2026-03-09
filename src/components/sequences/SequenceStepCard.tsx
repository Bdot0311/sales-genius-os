import { SequenceStep } from "@/hooks/use-sequences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  Mail,
  MoreVertical,
  Edit,
  Trash2,
  ArrowDown,
  Zap,
  MousePointer,
  Eye,
  AlertCircle,
} from "lucide-react";

interface SequenceStepCardProps {
  step: SequenceStep;
  stepNumber: number;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  sequenceType: 'basic' | 'behavioral' | 'custom';
}

const triggerIcons: Record<string, typeof Mail> = {
  on_enroll: Zap,
  on_delay: Clock,
  on_open: Eye,
  on_click: MousePointer,
  on_no_response: AlertCircle,
  on_silence: AlertCircle,
  on_custom: Zap,
};

const triggerLabels: Record<string, string> = {
  on_enroll: 'When enrolled',
  on_delay: 'After delay',
  on_open: 'Email opened',
  on_click: 'Link clicked',
  on_no_response: 'No response',
  on_silence: 'Gone silent',
  on_custom: 'Custom trigger',
};

export function SequenceStepCard({
  step,
  stepNumber,
  isLast,
  onEdit,
  onDelete,
  sequenceType,
}: SequenceStepCardProps) {
  const TriggerIcon = triggerIcons[step.trigger_condition] || Clock;
  const triggerLabel = triggerLabels[step.trigger_condition] || step.trigger_condition;
  
  const formatDelay = () => {
    const parts = [];
    if (step.delay_days > 0) {
      parts.push(`${step.delay_days} day${step.delay_days > 1 ? 's' : ''}`);
    }
    if (step.delay_hours > 0) {
      parts.push(`${step.delay_hours} hour${step.delay_hours > 1 ? 's' : ''}`);
    }
    return parts.length > 0 ? parts.join(' ') : 'Immediately';
  };

  const isBehavioralTrigger = ['on_open', 'on_click', 'on_no_response', 'on_silence'].includes(step.trigger_condition);
  const isCustomTrigger = step.trigger_condition === 'on_custom';

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-6 top-full w-0.5 h-4 bg-border" />
      )}
      
      <Card className={`relative ${!step.is_active ? 'opacity-50' : ''}`}>
        {/* Step number badge */}
        <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
          {stepNumber}
        </div>
        
        <CardHeader className="pb-3 pl-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-medium line-clamp-1">{step.subject_template}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    <TriggerIcon className="w-3 h-3 mr-1" />
                    {triggerLabel}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDelay()}
                  </Badge>
                  {isBehavioralTrigger && sequenceType === 'basic' && (
                    <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/50">
                      Pro feature
                    </Badge>
                  )}
                  {isCustomTrigger && sequenceType !== 'custom' && (
                    <Badge variant="outline" className="text-xs text-purple-500 border-purple-500/50">
                      Pro feature
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="pl-8 pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {step.body_template}
          </p>
        </CardContent>
      </Card>
      
      {/* Arrow to next step */}
      {!isLast && (
        <div className="flex justify-center py-2">
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
