import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Mail,
  Eye,
  MousePointer,
  Clock,
  MessageSquare,
  User,
} from "lucide-react";

type EngagementState = 
  | 'new'
  | 'contacted'
  | 'opened'
  | 'opened_no_click'
  | 'clicked'
  | 'silent_after_open'
  | 'silent_after_click'
  | 'replied';

interface LeadEngagementBadgeProps {
  state: EngagementState | string | null;
  className?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md';
}

const stateConfig: Record<EngagementState, {
  label: string;
  icon: typeof Sparkles;
  color: string;
  description: string;
}> = {
  new: {
    label: 'New',
    icon: Sparkles,
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    description: 'Lead has not been contacted yet',
  },
  contacted: {
    label: 'Contacted',
    icon: Mail,
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    description: 'Email has been sent',
  },
  opened: {
    label: 'Opened',
    icon: Eye,
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    description: 'Lead opened the email',
  },
  opened_no_click: {
    label: 'Opened (No Click)',
    icon: Eye,
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    description: 'Lead opened but did not click any links',
  },
  clicked: {
    label: 'Clicked',
    icon: MousePointer,
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    description: 'Lead clicked a link in the email',
  },
  silent_after_open: {
    label: 'Silent (After Open)',
    icon: Clock,
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    description: 'No activity after opening email (48+ hours)',
  },
  silent_after_click: {
    label: 'Silent (After Click)',
    icon: Clock,
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    description: 'No activity after clicking (48+ hours)',
  },
  replied: {
    label: 'Replied',
    icon: MessageSquare,
    color: 'bg-primary/10 text-primary border-primary/20',
    description: 'Lead has replied',
  },
};

export function LeadEngagementBadge({ 
  state, 
  className = '',
  showTooltip = true,
  size = 'md',
}: LeadEngagementBadgeProps) {
  const normalizedState = (state || 'new') as EngagementState;
  const config = stateConfig[normalizedState] || stateConfig.new;
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : '';

  const badge = (
    <Badge 
      variant="outline" 
      className={`${config.color} ${sizeClasses} ${className}`}
    >
      <Icon className={size === 'sm' ? 'w-2.5 h-2.5 mr-0.5' : 'w-3 h-3 mr-1'} />
      {config.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
