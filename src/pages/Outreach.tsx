import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Sparkles, CalendarPlus, Settings2, Image } from "lucide-react";

const Outreach = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState("");
  const [emailTone, setEmailTone] = useState("professional");
  const [emailGoal, setEmailGoal] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [signature, setSignature] = useState("");
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);

  useEffect(() => {
    loadLeads();
    loadSignature();
  }, []);

  const loadLeads = async () => {
    const { data } = await supabase.from("leads").select("*");
    if (data) setLeads(data);
  };

  const loadSignature = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("email_signature")
      .eq("id", user.id)
      .single();
    
    if (data?.email_signature) {
      setSignature(data.email_signature);
    }
  };

  const saveSignature = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsSavingSignature(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ email_signature: signature })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Signature saved",
        description: "Your email signature has been updated",
      });
      setSignatureDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error saving signature",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingSignature(false);
    }
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
      
      if (!lead.contact_email) {
        throw new Error('Lead does not have an email address');
      }

      // Check if user has connected Google
      const { data: integrations } = await supabase
        .from('integrations')
        .select('integration_id')
        .eq('is_active', true)
        .eq('integration_id', 'google');

      if (!integrations || integrations.length === 0) {
        toast({
          title: "Google not connected",
          description: "Please connect Google in the Integrations page first.",
          variant: "destructive",
        });
        setIsSending(false);
        return;
      }

      const integrationId = integrations[0].integration_id;

      // Send email via edge function
      console.log('Invoking send-email function with:', {
        to: lead.contact_email,
        integrationId,
      });

      // Combine email body with signature
      const fullEmailBody = signature 
        ? `${generatedEmail}\n\n${signature}`
        : generatedEmail;

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: lead.contact_email,
          subject: `${emailGoal === 'introduction' ? 'Introduction' : 
                    emailGoal === 'follow-up' ? 'Following Up' :
                    emailGoal === 'meeting' ? 'Meeting Request' :
                    emailGoal === 'demo' ? 'Demo Request' : 
                    'Proposal'} - ${lead.company_name}`,
          body: fullEmailBody,
          integrationId
        }
      });

      console.log('Send-email function response:', { data, error });

      if (error) {
        console.error('Send-email function error details:', error);
        throw error;
      }
      
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

  const sendToCalendar = async () => {
    if (!selectedLead) {
      toast({
        title: "Missing information",
        description: "Please select a lead first",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const lead = leads.find((l) => l.id === selectedLead);
      
      // Create a meeting activity
      const { error } = await supabase.from("activities").insert({
        subject: `Meeting with ${lead.contact_name}`,
        type: "meeting",
        lead_id: selectedLead,
        user_id: user.id,
        description: `Follow-up meeting scheduled via email`,
      });

      if (error) throw error;

      toast({
        title: "Added to calendar",
        description: "Meeting has been added to your calendar",
      });
    } catch (error: any) {
      toast({
        title: "Error adding to calendar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Outreach Studio</h1>
            <p className="text-muted-foreground">
              Generate AI-powered personalized emails for your leads
            </p>
          </div>
          <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-2" />
                {signature ? "Edit Signature" : "Add Signature"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Email Signature</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Your Signature (supports HTML for logos/images)</Label>
                  <Textarea
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder={`Best regards,
John Doe
Sales Director | Company Name
📧 john@company.com | 📞 (555) 123-4567
🌐 www.company.com

For logos, use HTML:
<img src="https://your-logo-url.com/logo.png" alt="Company Logo" width="150" />`}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    To add a logo, upload it to a hosting service and use: 
                    <code className="bg-muted px-1 rounded">&lt;img src="URL" width="150" /&gt;</code>
                  </p>
                </div>
                {signature && (
                  <div>
                    <Label className="text-muted-foreground">Preview</Label>
                    <div 
                      className="mt-2 p-4 border rounded-lg bg-background prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: signature.replace(/\n/g, '<br/>') }}
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveSignature} disabled={isSavingSignature}>
                    {isSavingSignature ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Signature"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
                <div className="flex gap-2">
                  <Button 
                    className="flex-1"
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
                  {emailGoal === "meeting" && (
                    <Button 
                      variant="outline"
                      onClick={sendToCalendar}
                    >
                      <CalendarPlus className="w-4 h-4 mr-2" />
                      Add to Calendar
                    </Button>
                  )}
                </div>
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
