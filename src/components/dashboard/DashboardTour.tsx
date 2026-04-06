import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, X } from "lucide-react";
import { createPortal } from "react-dom";

interface DashboardTourProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TourStep {
  title: string;
  description: string;
  selector: string; // CSS selector to highlight
  position: "top" | "bottom" | "left" | "right";
  fallbackPosition?: { top: number; left: number; width: number; height: number };
}

const tourSteps: TourStep[] = [
  {
    title: "Your Stats at a Glance",
    description: "Track total leads, active deals, pipeline value, and meetings — all updated in real-time as your data changes.",
    selector: ".grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4",
    position: "bottom",
  },
  {
    title: "Quick Actions",
    description: "Jump straight into outreach, pipeline management, or scheduling without navigating away.",
    selector: ".grid.grid-cols-1.md\\:grid-cols-3",
    position: "top",
  },
  {
    title: "Leads & Prospecting",
    description: "Find and manage your leads here. Use AI-powered search to describe your ideal customer in plain English.",
    selector: "a[href='/dashboard/leads'], button:has(> .lucide-users)",
    position: "right",
  },
  {
    title: "Pipeline Tracking",
    description: "Visualize deals through stages — from first contact to close. Drag and drop to update deal status.",
    selector: "a[href='/dashboard/pipeline']",
    position: "right",
  },
  {
    title: "Outreach Studio",
    description: "Generate personalized emails using AI, manage drafts, and track email performance from one place.",
    selector: "a[href='/dashboard/outreach']",
    position: "right",
  },
  {
    title: "AI Sales Coach",
    description: "Get personalized insights and recommendations to improve your sales approach and close more deals.",
    selector: "a[href='/dashboard/coach']",
    position: "right",
  },
];

export const DashboardTour = ({ isOpen, onClose }: DashboardTourProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const findTarget = useCallback((step: number) => {
    const el = document.querySelector(tourSteps[step].selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Wait for scroll to settle then measure
      setTimeout(() => {
        setTargetRect(el.getBoundingClientRect());
        setAnimating(false);
      }, 350);
    } else {
      // Fallback — show center-screen
      setTargetRect(new DOMRect(window.innerWidth / 2 - 150, window.innerHeight / 2 - 30, 300, 60));
      setAnimating(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setVisible(false);
      // Small delay so overlay fades in first
      requestAnimationFrame(() => {
        setVisible(true);
        findTarget(0);
      });
    } else {
      setVisible(false);
    }
  }, [isOpen, findTarget]);

  // Re-measure on resize
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => findTarget(currentStep);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen, currentStep, findTarget]);

  const goToStep = (step: number) => {
    setAnimating(true);
    setCurrentStep(step);
    findTarget(step);
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      goToStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
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

  if (!isOpen) return null;

  const step = tourSteps[currentStep];
  const pad = 8; // padding around the highlighted element

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { opacity: 0 };

    const tooltipWidth = 340;
    const tooltipGap = 16;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case "bottom":
        top = targetRect.bottom + pad + tooltipGap;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "top":
        top = targetRect.top - pad - tooltipGap - 180;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - 80;
        left = targetRect.right + pad + tooltipGap;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - 80;
        left = targetRect.left - pad - tooltipGap - tooltipWidth;
        break;
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - 220));

    return {
      position: "fixed",
      top,
      left,
      width: tooltipWidth,
      zIndex: 10002,
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      opacity: animating ? 0 : 1,
      transform: animating ? "translateY(8px)" : "translateY(0)",
    };
  };

  return createPortal(
    <div
      className={`fixed inset-0 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ zIndex: 10000 }}
    >
      {/* SVG overlay with cutout for highlighted element */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10000 }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - pad}
                y={targetRect.top - pad}
                width={targetRect.width + pad * 2}
                height={targetRect.height + pad * 2}
                rx="12"
                fill="black"
                style={{ transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Highlight ring around the target element */}
      {targetRect && (
        <div
          className="fixed rounded-xl pointer-events-none"
          style={{
            zIndex: 10001,
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            boxShadow: "0 0 0 3px hsl(var(--primary)), 0 0 20px hsl(var(--primary) / 0.3)",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {/* Click-catcher to prevent interaction outside */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 10001 }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Tooltip card */}
      <div ref={tooltipRef} style={getTooltipStyle()}>
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-5">
          {/* Close button */}
          <button
            onClick={handleComplete}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="mb-1 text-xs text-muted-foreground font-medium">
            Step {currentStep + 1} of {tourSteps.length}
          </div>
          <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex gap-1.5 mb-4">
            {tourSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? "w-6 bg-primary"
                    : i < currentStep
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleComplete} className="text-muted-foreground">
              Skip
            </Button>
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button variant="outline" size="sm" onClick={handlePrevious}>
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  Back
                </Button>
              )}
              <Button size="sm" onClick={handleNext}>
                {currentStep < tourSteps.length - 1 ? (
                  <>
                    Next
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </>
                ) : (
                  "Finish"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
