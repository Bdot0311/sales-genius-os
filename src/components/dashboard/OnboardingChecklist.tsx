import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface OnboardingProgress {
  completed_profile: boolean;
  added_first_lead: boolean;
  created_first_deal: boolean;
  set_up_integration: boolean;
  completed_tour: boolean;
}

interface OnboardingChecklistProps {
  onClose: () => void;
  onStartTour: () => void;
}

export const OnboardingChecklist = ({ onClose, onStartTour }: OnboardingChecklistProps) => {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error loading progress:", error);
        return;
      }

      if (!data) {
        // Create initial progress record
        const { data: newProgress } = await supabase
          .from("onboarding_progress")
          .insert({ user_id: user.id })
          .select()
          .single();
        
        setProgress(newProgress);
      } else {
        setProgress(data);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      key: "completed_tour" as keyof OnboardingProgress,
      title: "Take the Dashboard Tour",
      description: "Learn about key features",
      action: onStartTour,
      actionLabel: "Start Tour"
    },
    {
      key: "completed_profile" as keyof OnboardingProgress,
      title: "Complete Your Profile",
      description: "Add your details in settings",
      link: "/settings"
    },
    {
      key: "added_first_lead" as keyof OnboardingProgress,
      title: "Add Your First Lead",
      description: "Import or create a lead",
      link: "/leads"
    },
    {
      key: "created_first_deal" as keyof OnboardingProgress,
      title: "Create Your First Deal",
      description: "Start tracking opportunities",
      link: "/pipeline"
    },
    {
      key: "set_up_integration" as keyof OnboardingProgress,
      title: "Set Up an Integration",
      description: "Connect your tools",
      link: "/integrations"
    }
  ];

  if (loading) return null;

  const completedSteps = progress 
    ? Object.values(progress).filter(Boolean).length 
    : 0;
  const totalSteps = steps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  if (progressPercentage === 100) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Get Started with SalesOS</CardTitle>
            <CardDescription>
              Complete these steps to get the most out of your account
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{completedSteps} of {totalSteps} complete</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step) => {
            const isCompleted = progress?.[step.key] || false;
            
            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  isCompleted ? "bg-muted/50" : "hover:bg-muted/50"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                    {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                {!isCompleted && (step.link || step.action) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (step.action) {
                        step.action();
                      } else if (step.link) {
                        window.location.href = step.link;
                      }
                    }}
                  >
                    {step.actionLabel || "Go"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
