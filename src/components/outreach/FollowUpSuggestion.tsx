import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Calendar, ArrowRight, X, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FollowUpSuggestionProps {
  leadId: string;
  leadName: string;
  leadEmail: string;
  companyName: string;
  originalSubject: string;
  onSetupFollowUp: (suggestion: FollowUpData) => void;
  onDismiss: () => void;
}

export interface FollowUpData {
  suggestedSubject: string;
  suggestedBody: string;
  suggestedDays: number;
  triggerContext: string;
}

export const FollowUpSuggestion = ({
  leadId,
  leadName,
  leadEmail,
  companyName,
  originalSubject,
  onSetupFollowUp,
  onDismiss,
}: FollowUpSuggestionProps) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(true);
  const [suggestion, setSuggestion] = useState<FollowUpData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateFollowUpSuggestion();
  }, [leadId, leadName, companyName, originalSubject]);

  const generateFollowUpSuggestion = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-followup-suggestion', {
        body: {
          leadName,
          companyName,
          originalSubject,
          leadEmail,
        }
      });

      if (fnError) throw fnError;

      if (data?.suggestion) {
        setSuggestion(data.suggestion);
      } else {
        throw new Error("No suggestion generated");
      }
    } catch (err: any) {
      console.error("Follow-up suggestion error:", err);
      setError(err.message || "Failed to generate suggestion");
      
      // Fallback suggestion if AI fails
      setSuggestion({
        suggestedSubject: `Re: ${originalSubject}`,
        suggestedBody: `Hi ${leadName},\n\nJust wanted to follow up on my previous email. I'd love to hear your thoughts on how we might help ${companyName}.\n\nWorth a quick chat this week?\n\nBest,`,
        suggestedDays: 3,
        triggerContext: `Following up on introduction to ${leadName}`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScheduleReminder = async () => {
    if (!suggestion) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + suggestion.suggestedDays);

      const { error: activityError } = await supabase.from("activities").insert({
        subject: `Follow up with ${leadName}`,
        type: "follow_up",
        lead_id: leadId,
        user_id: user.id,
        description: `Send follow-up email: "${suggestion.suggestedSubject}"`,
        due_date: reminderDate.toISOString(),
      });

      if (activityError) throw activityError;

      toast({
        title: "Follow-up scheduled!",
        description: `Reminder set for ${suggestion.suggestedDays} days from now`,
      });

      onDismiss();
    } catch (err: any) {
      toast({
        title: "Error scheduling follow-up",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (isGenerating) {
    return (
      <Card className="p-4 border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">AI is generating follow-up suggestion...</p>
            <p className="text-xs text-muted-foreground">Analyzing your sent email for best follow-up strategy</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!suggestion) {
    return null;
  }

  return (
    <Card className="p-4 border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">AI Follow-up Suggestion</p>
              <Badge variant="secondary" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                {suggestion.suggestedDays} days
              </Badge>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Suggested subject:</p>
              <p className="text-sm font-medium truncate">{suggestion.suggestedSubject}</p>
            </div>

            <p className="text-xs text-muted-foreground line-clamp-2">
              {suggestion.suggestedBody.split('\n')[0]}...
            </p>

            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <Button 
                size="sm" 
                onClick={() => onSetupFollowUp(suggestion)}
                className="gap-1"
              >
                <ArrowRight className="w-3 h-3" />
                Setup Follow-up
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleScheduleReminder}
                className="gap-1"
              >
                <Calendar className="w-3 h-3" />
                Schedule Reminder
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={generateFollowUpSuggestion}
                className="gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </Button>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-6 w-6"
          onClick={onDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
};
