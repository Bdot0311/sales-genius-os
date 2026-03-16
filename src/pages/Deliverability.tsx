import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ShieldCheck, Mail, Clock, CheckCircle2, XCircle, AlertCircle, Plus } from "lucide-react";
import { useState } from "react";

const Deliverability = () => {
  const [domainInput, setDomainInput] = useState("");
  const [showDNSCheck, setShowDNSCheck] = useState(false);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deliverability</h1>
          <p className="text-muted-foreground">Monitor mailbox health, warmup progress, and DNS configuration</p>
        </div>

        {/* Section 1: Connected Mailboxes */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Connected Mailboxes</h2>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No mailboxes connected</h3>
              <p className="text-muted-foreground text-center mb-4">Connect your sending mailboxes to monitor deliverability.</p>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Connect Mailbox
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Warmup Tracker */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Warmup Tracker</h2>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Connect a mailbox to start warmup tracking.</p>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: DNS Health Checker */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">DNS Health Checker</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Check a domain</CardTitle>
              <CardDescription>Verify SPF, DKIM, and DMARC records for your sending domain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="yourdomain.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                />
                <Button onClick={() => setShowDNSCheck(!!domainInput)}>Check</Button>
              </div>

              {showDNSCheck && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg border">
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">SPF Record</p>
                      <p className="text-xs text-muted-foreground">Manual verification required</p>
                    </div>
                    <Badge variant="outline">Check Manually</Badge>
                  </div>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="spf">
                      <AccordionTrigger className="text-sm">How to set up SPF</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground mb-2">Add this TXT record to your DNS:</p>
                        <code className="block p-2 rounded bg-muted text-xs">v=spf1 include:_spf.google.com ~all</code>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="dkim">
                      <AccordionTrigger className="text-sm">How to set up DKIM</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground">Enable DKIM in your Google Workspace Admin console under Apps → Google Workspace → Gmail → Authenticate email.</p>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="dmarc">
                      <AccordionTrigger className="text-sm">How to set up DMARC</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground mb-2">Add this TXT record to your DNS:</p>
                        <code className="block p-2 rounded bg-muted text-xs">v=DMARC1; p=quarantine; rua=mailto:dmarc@{domainInput}</code>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 4: Sending Rules */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Sending Rules</h2>
          <Card>
            <CardContent className="py-6 space-y-3">
              {[
                { label: "Max sends per mailbox per day", value: "100" },
                { label: "Send time window", value: "Tue–Thu, 7am–9am & 1pm–3pm (recipient TZ)" },
                { label: "Delay between sends", value: "30–120 seconds (randomized)" },
                { label: "Rotation", value: "Round-robin across connected mailboxes" },
                { label: "Text variation", value: "Subtle rewording per batch to avoid pattern detection" },
              ].map((rule) => (
                <div key={rule.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">{rule.label}</span>
                  <span className="text-sm font-medium">{rule.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Deliverability;
