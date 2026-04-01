import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, BarChart3, Users, TrendingUp, Zap, Calendar, Bot } from "lucide-react";

interface DashboardTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DashboardTour = ({ isOpen, onClose }: DashboardTourProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const tourSteps = [
    {
      title: "Welcome to Your Dashboard!",
      description: "Let's take a quick tour of the key features that will help you manage your sales pipeline effectively.",
      icon: <TrendingUp className="h-12 w-12 text-primary" />
    },
    {
      title: "Performance Overview",
      description: "Track your key metrics at a glance - total leads, active deals, pipeline value, and upcoming meetings. These stats update in real-time.",
      icon: <BarChart3 className="h-12 w-12 text-primary" />
    },
    {
      title: "Lead Management",
      description: "Add and manage leads from the Leads page. Use AI-powered lead scoring to prioritize your outreach efforts.",
      icon: <Users className="h-12 w-12 text-primary" />
    },
    {
      title: "Pipeline Tracking",
      description: "Visualize your deals through different stages. Drag and drop to update deal status and track your sales funnel.",
      icon: <TrendingUp className="h-12 w-12 text-primary" />
    },
    {
      title: "Quick Actions",
      description: "Access frequently used features quickly - create outreach campaigns, view your pipeline, or schedule meetings.",
      icon: <Zap className="h-12 w-12 text-primary" />
    },
    {
      title: "AI Sales Coach",
      description: "Get personalized insights and recommendations to improve your sales performance (Pro plan feature).",
      icon: <Bot className="h-12 w-12 text-primary" />
    },
    {
      title: "Calendar & Activities",
      description: "Manage your meetings and track all sales activities in one place. Never miss a follow-up!",
      icon: <Calendar className="h-12 w-12 text-primary" />
    }
  ];

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("onboarding_progress")
          .update({ completed_tour: true })
          .eq("user_id", user.id);
      }
    } catch (error) {
      console.error("Error updating tour progress:", error);
    }
    onClose();
  };

  const handleSkip = async () => {
    await handleComplete();
  };

  const step = tourSteps[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            {step.icon}
          </div>
          <DialogTitle className="text-center text-xl">{step.title}</DialogTitle>
          <DialogDescription className="text-center text-base">
            {step.description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-center gap-2 my-4">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-2 rounded-full transition-colors ${
                index === currentStep ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button variant="ghost" onClick={handleSkip}>
            Skip Tour
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handlePrevious}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
            )}
            <Button onClick={handleNext}>
              {currentStep < tourSteps.length - 1 ? (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              ) : (
                "Get Started"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
