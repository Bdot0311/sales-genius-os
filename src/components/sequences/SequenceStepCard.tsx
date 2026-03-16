import { useState } from "react";
import { SequenceStep } from "@/hooks/use-sequences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  GitBranch,
  Linkedin,
  Phone,
} from "lucide-react";

interface BranchConfig {
  enabled: boolean;
  pathA: { condition: string; delayDays: number; actionType: string };
  pathB: { condition: string; delayDays: number; actionType: string };
}

interface SequenceStepCardProps {
  step: SequenceStep & { branch_config?: BranchConfig | null };
  stepNumber: number;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onBranchChange?: (stepId: string, branchConfig: BranchConfig) => void;
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

const actionTypeOptions = [
  { value: "email", label: "Email", icon: Mail },
  { value: "linkedin", label: "LinkedIn Task", icon: Linkedin },
  { value: "phone", label: "Phone Task", icon: Phone },
];

export function SequenceStepCard({
  step,
  stepNumber,
  isLast,
  onEdit,
  onDelete,
  onBranchChange,
  sequenceType,
}: SequenceStepCardProps) {
  const TriggerIcon = triggerIcons[step.trigger_condition] || Clock;
  const triggerLabel = triggerLabels[step.trigger_condition] || step.trigger_condition;

  const defaultBranch: BranchConfig = {
    enabled: false,
    pathA: { condition: "opened_no_reply", delayDays: 2, actionType: "email" },
    pathB: { condition: "never_opened", delayDays: 3, actionType: "email" },
  };

  const branchConfig: BranchConfig = (step as any).branch_config ?? defaultBranch;
  const [localBranch, setLocalBranch] = useState<BranchConfig>(branchConfig);

  const updateBranch = (updates: Partial<BranchConfig>) => {
    const next = { ...localBranch, ...updates };
    setLocalBranch(next);
    onBranchChange?.(step.id, next);
  };

  const updatePathA = (updates: Partial<BranchConfig["pathA"]>) => {
    const next = { ...localBranch, pathA: { ...localBranch.pathA, ...updates } };
    setLocalBranch(next);
    onBranchChange?.(step.id, next);
  };

  const updatePathB = (updates: Partial<BranchConfig["pathB"]>) => {
    const next = { ...localBranch, pathB: { ...localBranch.pathB, ...updates } };
    setLocalBranch(next);
    onBranchChange?.(step.id, next);
  };
  
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

  const ActionIcon = ({ type }: { type: string }) => {
    const opt = actionTypeOptions.find(o => o.value === type);
    const Icon = opt?.icon || Mail;
    return <Icon className="w-3 h-3" />;
  };

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && !localBranch.enabled && (
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
                <div className="flex items-center gap-2 mt-1 flex-wrap">
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
            
            <div className="flex items-center gap-1">
              {/* Branch toggle */}
              <div className="flex items-center gap-1.5 mr-2">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <Switch
                  checked={localBranch.enabled}
                  onCheckedChange={(checked) => updateBranch({ enabled: checked })}
                  className="scale-75"
                />
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
          </div>
        </CardHeader>
        
        <CardContent className="pl-8 pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {step.body_template}
          </p>
        </CardContent>
      </Card>

      {/* Branch paths */}
      {localBranch.enabled && (
        <div className="ml-6 mt-2 space-y-2">
          {/* Vertical connector */}
          <div className="flex items-stretch gap-3">
            <div className="w-0.5 bg-green-500/40 rounded-full" />
            <div className="flex-1 p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-medium text-green-500">Path A: Opened but no reply</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Delay</Label>
                  <Input
                    type="number"
                    min={1}
                    value={localBranch.pathA.delayDays}
                    onChange={(e) => updatePathA({ delayDays: parseInt(e.target.value) || 1 })}
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
                <Select value={localBranch.pathA.actionType} onValueChange={(v) => updatePathA({ actionType: v })}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <opt.icon className="w-3 h-3" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-stretch gap-3">
            <div className="w-0.5 bg-orange-500/40 rounded-full" />
            <div className="flex-1 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-medium text-orange-500">Path B: Never opened</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Delay</Label>
                  <Input
                    type="number"
                    min={1}
                    value={localBranch.pathB.delayDays}
                    onChange={(e) => updatePathB({ delayDays: parseInt(e.target.value) || 1 })}
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
                <Select value={localBranch.pathB.actionType} onValueChange={(v) => updatePathB({ actionType: v })}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <opt.icon className="w-3 h-3" />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Arrow to next step */}
      {!isLast && (
        <div className="flex justify-center py-2">
          <ArrowDown className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
