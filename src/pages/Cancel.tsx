import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft, Mail, DollarSign } from "lucide-react";

const Cancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-6">
              <XCircle className="h-16 w-16 text-muted-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold">Payment Cancelled</h1>
          <p className="text-xl text-muted-foreground">
            Your payment was not processed. No charges have been made.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What would you like to do?</CardTitle>
            <CardDescription>
              You can return to our pricing page or reach out if you need assistance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="border-2 hover:border-primary transition-colors cursor-pointer group">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <DollarSign className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">View Pricing Plans</h3>
                    <p className="text-sm text-muted-foreground">
                      Review our plans and choose the one that fits your needs
                    </p>
                    <Button 
                      className="w-full mt-4"
                      onClick={() => navigate('/pricing')}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Pricing
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-primary transition-colors cursor-pointer group">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Contact Support</h3>
                    <p className="text-sm text-muted-foreground">
                      Have questions? Our team is here to help you
                    </p>
                    <Button 
                      variant="outline"
                      className="w-full mt-4"
                      onClick={() => window.location.href = 'mailto:support@salesos.com'}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Email Support
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-3">Common Questions</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• No payment was processed and your card was not charged</p>
                <p>• You can return anytime to complete your subscription</p>
                <p>• Need help choosing a plan? Contact our sales team</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/')}
              >
                Go to Homepage
              </Button>
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/auth')}
              >
                Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Cancel;
