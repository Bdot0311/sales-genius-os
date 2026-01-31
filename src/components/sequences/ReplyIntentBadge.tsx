import { Badge } from '@/components/ui/badge';
import { 
  Flame, 
  Snowflake, 
  HelpCircle, 
  MessageSquare,
  Clock,
  AlertTriangle,
  ThumbsUp
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DetectedSignals {
  has_question?: boolean;
  has_timing?: boolean;
  has_objection?: boolean;
  has_positive?: boolean;
  has_meeting_request?: boolean;
  has_auto_reply?: boolean;
}

interface ReplyIntentBadgeProps {
  intentScore: number;
  intentClassification: 'high_intent' | 'low_intent' | 'neutral';
  detectedSignals?: DetectedSignals;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export const ReplyIntentBadge = ({
  intentScore,
  intentClassification,
  detectedSignals,
  showScore = false,
  size = 'md',
}: ReplyIntentBadgeProps) => {
  const getVariant = () => {
    switch (intentClassification) {
      case 'high_intent':
        return 'default';
      case 'low_intent':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getIcon = () => {
    const iconSize = size === 'sm' ? 12 : 14;
    switch (intentClassification) {
      case 'high_intent':
        return <Flame className={`w-${iconSize === 12 ? 3 : 3.5} h-${iconSize === 12 ? 3 : 3.5}`} />;
      case 'low_intent':
        return <Snowflake className={`w-${iconSize === 12 ? 3 : 3.5} h-${iconSize === 12 ? 3 : 3.5}`} />;
      default:
        return <HelpCircle className={`w-${iconSize === 12 ? 3 : 3.5} h-${iconSize === 12 ? 3 : 3.5}`} />;
    }
  };

  const getLabel = () => {
    switch (intentClassification) {
      case 'high_intent':
        return 'High Intent';
      case 'low_intent':
        return 'Low Intent';
      default:
        return 'Neutral';
    }
  };

  const getColorClasses = () => {
    switch (intentClassification) {
      case 'high_intent':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20';
      case 'low_intent':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const signalIcons = [];
  if (detectedSignals?.has_question) {
    signalIcons.push({ icon: MessageSquare, label: 'Contains question' });
  }
  if (detectedSignals?.has_timing) {
    signalIcons.push({ icon: Clock, label: 'Mentions timing' });
  }
  if (detectedSignals?.has_objection) {
    signalIcons.push({ icon: AlertTriangle, label: 'Has objection' });
  }
  if (detectedSignals?.has_positive) {
    signalIcons.push({ icon: ThumbsUp, label: 'Positive signal' });
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getVariant()} 
            className={`${getColorClasses()} ${size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1'} gap-1 cursor-help`}
          >
            {getIcon()}
            <span>{getLabel()}</span>
            {showScore && (
              <span className="opacity-70">({intentScore})</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium">
              Intent Score: {intentScore}/100
            </div>
            {signalIcons.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Detected signals:</div>
                {signalIcons.map((signal, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <signal.icon className="w-3 h-3" />
                    <span>{signal.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
