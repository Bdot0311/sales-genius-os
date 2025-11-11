import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const CustomDomainTab = () => {
  const handleOpenDomainSettings = () => {
    // This will be handled by Lovable's built-in domain settings
    window.open("https://docs.lovable.dev/features/custom-domain", "_blank");
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Custom Domain Setup</AlertTitle>
        <AlertDescription>
          As an Elite plan member, you can connect your own domain to host this application with your branding.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Connect Your Domain
          </CardTitle>
          <CardDescription>
            Follow these steps to set up your custom domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1">Access Domain Settings</h4>
                <p className="text-sm text-muted-foreground">
                  Click on your project name in the top left, go to Settings → Domains
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1">Add Your Domain</h4>
                <p className="text-sm text-muted-foreground">
                  Click "Connect Domain" and enter your domain name (e.g., yourdomain.com)
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1">Configure DNS Records</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Add these DNS records at your domain registrar:
                </p>
                <div className="space-y-2 bg-muted p-3 rounded-lg text-xs font-mono">
                  <div>
                    <strong>A Record</strong> (root domain)
                    <br />
                    Name: @ | Value: 185.158.133.1
                  </div>
                  <div>
                    <strong>A Record</strong> (www subdomain)
                    <br />
                    Name: www | Value: 185.158.133.1
                  </div>
                  <div>
                    <strong>TXT Record</strong> (verification)
                    <br />
                    Name: _lovable | Value: lovable_verify=ABC (shown in setup)
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                4
              </div>
              <div>
                <h4 className="font-semibold mb-1">Wait for Verification</h4>
                <p className="text-sm text-muted-foreground">
                  DNS propagation can take up to 72 hours. SSL certificate will be automatically provisioned once verified.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="font-semibold mb-3">Domain Status Indicators</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-medium">Active:</span>
                <span className="text-muted-foreground">Domain is live and serving your app</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Verifying:</span>
                <span className="text-muted-foreground">Waiting for DNS propagation</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Action Required:</span>
                <span className="text-muted-foreground">Complete the setup process</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="font-medium">Failed:</span>
                <span className="text-muted-foreground">SSL provisioning failed, retry needed</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleOpenDomainSettings} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              View Setup Guide
            </Button>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Important Notes</AlertTitle>
            <AlertDescription className="space-y-1 text-sm">
              <p>• Add both root domain and www subdomain separately</p>
              <p>• Use tools like DNSChecker.org to verify your DNS settings</p>
              <p>• If you have CAA records, ensure they allow Let's Encrypt for SSL</p>
              <p>• Contact support if domain isn't verifying after 72 hours</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};
