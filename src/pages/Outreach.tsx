import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Sparkles } from "lucide-react";

const Outreach = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState("");
  const [emailTone, setEmailTone] = useState("professional");
  const [emailGoal, setEmailGoal] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    const { data } = await supabase.from("leads").select("*");
    if (data) setLeads(data);
  };

  const generateEmail = async () => {
    if (!selectedLead || !emailGoal) {
      toast({
        title: "Missing information",
        description: "Please select a lead and specify the email goal",
        variant: "destructive",
      });
      return;
    }

    // Validate email goal length
    if (emailGoal.length > 500) {
      toast({
        title: "Invalid input",
        description: "Email goal must be less than 500 characters",
        variant: "destructive",
      });
      return;
    }

    // Validate tone is from allowed list
    const allowedTones = ["professional", "friendly", "casual", "formal"];
    if (!allowedTones.includes(emailTone)) {
      toast({
        title: "Invalid input",
        description: "Invalid email tone selected",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: emailGoal,
        },
      });

      if (error) throw error;
      setGeneratedEmail(data.email);
      toast({
        title: "Email generated",
        description: "AI has created a personalized email for you",
      });
    } catch (error: any) {
      toast({
        title: "Error generating email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const sendEmail = async () => {
    if (!selectedLead || !generatedEmail) {
      toast({
        title: "Missing information",
        description: "Please generate an email first",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      
      // In a real implementation, this would send via an email service
      // For now, we'll simulate sending
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast({
        title: "Email sent!",
        description: `Email sent to ${lead.contact_name} at ${lead.contact_email}`,
      });
      
      // Clear the form
      setGeneratedEmail("");
      setSelectedLead("");
      setEmailGoal("");
    } catch (error: any) {
      toast({
        title: "Error sending email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Outreach Studio</h1>
          <p className="text-muted-foreground">
            Generate AI-powered personalized emails for your leads
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Email Configuration</h2>
            <div className="space-y-4">
              <div>
                <Label>Select Lead</Label>
                <Select value={selectedLead} onValueChange={setSelectedLead}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.contact_name} - {lead.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Email Tone</Label>
                <Select value={emailTone} onValueChange={setEmailTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Email Goal</Label>
                <Select value={emailGoal} onValueChange={setEmailGoal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose email goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="introduction">Introduction</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="meeting">Schedule Meeting</SelectItem>
                    <SelectItem value="demo">Request Demo</SelectItem>
                    <SelectItem value="proposal">Send Proposal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={generateEmail}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Email
                  </>
                )}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Generated Email</h2>
            {generatedEmail ? (
              <div className="space-y-4">
                <Textarea
                  value={generatedEmail}
                  onChange={(e) => setGeneratedEmail(e.target.value)}
                  className="min-h-[300px]"
                />
                <Button 
                  className="w-full"
                  onClick={sendEmail}
                  disabled={isSending}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Generate an email to see it here
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Outreach;
