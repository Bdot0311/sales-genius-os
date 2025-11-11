import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight, Settings, Users, TrendingUp } from "lucide-react";

const Success = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo(0, 0);
  }, []);

  const setupSteps = [
    {
      icon: <Users className="h-5 w-5" />,
      title: "Import Your Leads",
      description: "Start by adding your contacts to begin managing your sales pipeline effectively."
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      title: "Set Up Your Pipeline",
      description: "Customize your deal stages and track opportunities through your sales funnel."
    },
    {
      icon: <Settings className="h-5 w-5" />,
      title: "Configure Integrations",
      description: "Connect your email, calendar, and other tools to streamline your workflow."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-6">
              <CheckCircle className="h-16 w-16 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold">Payment Successful!</h1>
          <p className="text-xl text-muted-foreground">
            Welcome to SalesOS. Your account is now activated.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get Started with SalesOS</CardTitle>
            <CardDescription>
              Follow these steps to set up your account and start closing more deals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {setupSteps.map((step, index) => (
                <div key={index} className="flex gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <div className="flex-shrink-0 text-muted-foreground">
                    <span className="text-sm font-medium">Step {index + 1}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                className="flex-1"
                onClick={() => navigate('/auth')}
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/settings')}
              >
                Manage Subscription
              </Button>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground text-center">
                Need help getting started?{" "}
                <a href="mailto:support@alephwave.io" className="text-primary hover:underline">
                  Contact our support team
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            You can manage your subscription, view billing history, and update payment methods from your{" "}
            <button 
              onClick={() => navigate('/settings')}
              className="text-primary hover:underline"
            >
              settings page
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Success;
