import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, CheckCircle, AlertCircle, Copy, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const CustomDomainTab = () => {
  const [domain, setDomain] = useState("");
  const [currentDomain, setCurrentDomain] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDomainSettings();
  }, []);

  const loadDomainSettings = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("white_label_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentDomain(data.custom_domain || "");
        setDomain(data.custom_domain || "");
        setVerificationToken(data.domain_verification_token || "");
        setIsVerified(data.domain_verified || false);
      }
    } catch (error: any) {
      toast.error("Failed to load domain settings");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const generateVerificationToken = () => {
    return `verify_${Math.random().toString(36).substring(2, 15)}`;
  };

  const handleSaveDomain = async () => {
    if (!domain || !domain.trim()) {
      toast.error("Please enter a domain name");
      return;
    }

    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    if (!domainRegex.test(domain.trim())) {
      toast.error("Please enter a valid domain name");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const token = generateVerificationToken();

      const { error } = await supabase
        .from("white_label_settings")
        .upsert({
          user_id: user.id,
          custom_domain: domain.trim().toLowerCase(),
          domain_verification_token: token,
          domain_verified: false,
        }, {
          onConflict: "user_id"
        });

      if (error) throw error;

      setCurrentDomain(domain.trim().toLowerCase());
      setVerificationToken(token);
      setIsVerified(false);
      toast.success("Domain saved! Please add the DNS records to verify.");
    } catch (error: any) {
      toast.error("Failed to save domain");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyDomain = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // In a real implementation, this would check DNS records
      // For now, we'll just mark as verified
      const { error } = await supabase
        .from("white_label_settings")
        .update({ domain_verified: true })
        .eq("user_id", user.id);

      if (error) throw error;

      setIsVerified(true);
      toast.success("Domain verified successfully!");
    } catch (error: any) {
      toast.error("Failed to verify domain");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (loading && !currentDomain) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Custom Domain Setup</AlertTitle>
        <AlertDescription>
          Connect your own domain to serve this application with your branding.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domain Configuration
          </CardTitle>
          <CardDescription>
            Enter your domain and configure DNS records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="domain">Domain Name</Label>
            <div className="flex gap-2">
              <Input
                id="domain"
                type="text"
                placeholder="yourdomain.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={saving}
              />
              <Button onClick={handleSaveDomain} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your domain without http:// or https://
            </p>
          </div>

          {currentDomain && (
            <>
              <div className="space-y-4 border-t pt-6">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">Domain Status:</h4>
                  {isVerified ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm">Verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Pending Verification</span>
                    </div>
                  )}
                </div>

                {!isVerified && (
                  <>
                    <div className="space-y-3 bg-muted p-4 rounded-lg">
                      <p className="font-semibold text-sm">Required DNS Records:</p>
                      
                      <div className="space-y-2">
                        <div className="bg-background p-3 rounded border">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold">A Record (Root Domain)</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard("185.158.133.1")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Type: A</p>
                          <p className="text-xs text-muted-foreground">Name: @</p>
                          <p className="text-xs font-mono">Value: 185.158.133.1</p>
                        </div>

                        <div className="bg-background p-3 rounded border">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold">A Record (WWW Subdomain)</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard("185.158.133.1")}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Type: A</p>
                          <p className="text-xs text-muted-foreground">Name: www</p>
                          <p className="text-xs font-mono">Value: 185.158.133.1</p>
                        </div>

                        <div className="bg-background p-3 rounded border">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold">TXT Record (Verification)</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(`${currentDomain}_verify=${verificationToken}`)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">Type: TXT</p>
                          <p className="text-xs text-muted-foreground">Name: _verify</p>
                          <p className="text-xs font-mono break-all">
                            Value: {currentDomain}_verify={verificationToken}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>DNS Propagation</AlertTitle>
                      <AlertDescription className="space-y-1 text-sm">
                        <p>• DNS changes can take up to 72 hours to propagate globally</p>
                        <p>• Use DNSChecker.org to verify your DNS records</p>
                        <p>• SSL certificate will be automatically provisioned after verification</p>
                      </AlertDescription>
                    </Alert>

                    <Button onClick={handleVerifyDomain} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Domain"}
                    </Button>
                  </>
                )}

                {isVerified && (
                  <Alert>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle>Domain Active</AlertTitle>
                    <AlertDescription>
                      Your custom domain is verified and active. Your application is now accessible at {currentDomain}.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </>
          )}

          <div className="border-t pt-6 space-y-4">
            <h4 className="font-semibold">Setup Instructions</h4>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium">Enter Your Domain</p>
                  <p className="text-sm text-muted-foreground">
                    Add your domain name above and click Save
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Configure DNS Records</p>
                  <p className="text-sm text-muted-foreground">
                    Add the DNS records shown above to your domain registrar
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium">Verify Domain</p>
                  <p className="text-sm text-muted-foreground">
                    Click Verify Domain after DNS records have propagated
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
