import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Palette, Loader2, Save, Globe, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { useWhiteLabel } from "@/hooks/use-white-label";

export const WhiteLabelTab = () => {
  const { settings, loading, updateSettings } = useWhiteLabel();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    logo_url: "",
    primary_color: "#8B5CF6",
    secondary_color: "#10B981",
    accent_color: "#F59E0B"
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name || "",
        logo_url: settings.logo_url || "",
        primary_color: settings.primary_color,
        secondary_color: settings.secondary_color,
        accent_color: settings.accent_color
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateSettings(formData);
      if (result.success) {
        toast.success("White label settings saved successfully");
      } else {
        toast.error("Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving white label settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDomainSettings = () => {
    window.open("https://docs.lovable.dev/features/custom-domain", "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Palette className="h-4 w-4" />
        <AlertTitle>White Label Settings</AlertTitle>
        <AlertDescription>
          Customize branding, colors, and domain settings to make this platform your own (Elite plan feature)
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Branding & Appearance
          </CardTitle>
          <CardDescription>
            Customize the look and feel of your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              placeholder="Your Company Name"
            />
            <p className="text-xs text-muted-foreground">
              This will replace "SalesOS" throughout the dashboard
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo_url">Logo URL</Label>
            <Input
              id="logo_url"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              Provide a URL to your company logo (recommended: 200x50px)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primary_color"
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  className="h-10 w-20 p-1"
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  placeholder="#8B5CF6"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_color">Secondary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="secondary_color"
                  type="color"
                  value={formData.secondary_color}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  className="h-10 w-20 p-1"
                />
                <Input
                  value={formData.secondary_color}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  placeholder="#10B981"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent_color">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  id="accent_color"
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  className="h-10 w-20 p-1"
                />
                <Input
                  value={formData.accent_color}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  placeholder="#F59E0B"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="font-semibold mb-3">Color Preview</h4>
            <div className="p-6 rounded-lg border" style={{ 
              background: `linear-gradient(135deg, ${formData.primary_color}15 0%, ${formData.secondary_color}15 100%)`
            }}>
              <div className="space-y-3">
                <Button style={{ backgroundColor: formData.primary_color }}>
                  Primary Button
                </Button>
                <Button style={{ backgroundColor: formData.secondary_color }}>
                  Secondary Button
                </Button>
                <Button style={{ backgroundColor: formData.accent_color }}>
                  Accent Button
                </Button>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Branding
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Custom Domain
          </CardTitle>
          <CardDescription>
            Connect your own domain to host this application
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

          <Button onClick={handleOpenDomainSettings} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Open Domain Setup Guide
          </Button>

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
