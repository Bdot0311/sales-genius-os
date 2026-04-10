import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface QuickStartWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MOCK_PROSPECTS = [
  { name: "Sarah Chen", title: "VP Sales", company: "Acme Corp", score: 94 },
  { name: "Marcus Rivera", title: "Head of Growth", company: "TechFlow", score: 89 },
  { name: "Emma Patel", title: "Sales Director", company: "DataSync", score: 87 },
];

const MOCK_EMAIL = `Subject: Quick question about [Company]'s outbound motion

Hi [First Name],

Noticed [Company] is scaling its sales team — congrats on the growth.

We help teams like yours find verified contacts and run personalized outreach at scale.

Worth a 15-min chat?`;

const QuickStartWizard = ({ open, onOpenChange }: QuickStartWizardProps) => {
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-foreground border-border sm:max-w-lg">
        <DialogHeader>
          <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
            Step {step} of {totalSteps}
          </p>
          <DialogTitle className="text-xl font-bold">
            {step === 1 && "Who do you sell to?"}
            {step === 2 && "Here are your top matches"}
            {step === 3 && "Here's your AI-drafted opener"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Input
                  placeholder="Job title (e.g. VP of Sales)"
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
                <Input
                  placeholder="Industry (e.g. SaaS, Fintech)"
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
                <Input
                  placeholder="Company size (e.g. 50-500 employees)"
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {MOCK_PROSPECTS.map((prospect) => (
                <div
                  key={prospect.name}
                  className="flex items-center justify-between p-4 rounded-lg bg-background border border-border"
                >
                  <div>
                    <p className="font-semibold text-foreground">{prospect.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {prospect.title} · {prospect.company}
                    </p>
                  </div>
                  <Badge className="bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/20">
                    {prospect.score}% match
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div>
              <pre className="whitespace-pre-wrap rounded-lg bg-background border border-border p-4 text-sm text-foreground font-mono leading-relaxed">
                {MOCK_EMAIL}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Back
          </Button>

          {step === 1 && (
            <Button onClick={handleNext}>
              Find leads →
            </Button>
          )}
          {step === 2 && (
            <Button onClick={handleNext}>
              Draft an email →
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleClose}>
              Start sending →
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickStartWizard;
