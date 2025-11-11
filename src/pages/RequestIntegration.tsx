import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const RequestIntegration = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    integration: "",
    description: "",
    useCase: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name || !formData.email || !formData.integration) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    
    try {
      // Call edge function to send email
      const { error } = await supabase.functions.invoke('send-integration-request', {
        body: formData
      });

      if (error) throw error;

      toast.success("Integration request sent successfully! We'll get back to you soon.");
      
      // Reset form
      setFormData({
        name: "",
        email: "",
        company: "",
        integration: "",
        description: "",
        useCase: "",
      });
      
      // Navigate back after a short delay
      setTimeout(() => navigate('/'), 2000);
    } catch (error: any) {
      console.error("Error sending integration request:", error);
      toast.error("Failed to send request. Please try again or email us directly at support@alephwave.io");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 container mx-auto px-4 pt-24 pb-12 max-w-3xl">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Request an Integration</h1>
            <p className="text-muted-foreground">
              Tell us which tool you'd like to integrate with SalesOS and we'll prioritize it in our roadmap.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Integration Request Form</CardTitle>
              <CardDescription>
                Fill out the form below and we'll review your request within 48 hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Your Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="john@company.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Acme Inc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="integration">
                    Integration Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="integration"
                    name="integration"
                    value={formData.integration}
                    onChange={handleChange}
                    placeholder="e.g., Salesforce, HubSpot, LinkedIn"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Which tool or platform would you like to integrate?
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    Integration Description
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe what data you'd like to sync and how the integration should work..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="useCase">
                    Use Case
                  </Label>
                  <Textarea
                    id="useCase"
                    name="useCase"
                    value={formData.useCase}
                    onChange={handleChange}
                    placeholder="How will this integration help your sales process?"
                    rows={3}
                  />
                </div>

                <div className="flex gap-4">
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  By submitting this form, you agree to be contacted regarding your integration request.
                  We'll never share your information with third parties.
                </p>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                If you have questions about integrations or need immediate assistance, 
                reach out to us directly at{" "}
                <a 
                  href="mailto:support@alephwave.io" 
                  className="text-primary hover:underline"
                >
                  support@alephwave.io
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default RequestIntegration;
