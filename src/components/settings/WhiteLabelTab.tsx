import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Palette, Loader2, Save, Globe, CheckCircle, AlertCircle, Upload, X, Copy } from "lucide-react";
import { useWhiteLabel } from "@/hooks/use-white-label";
import { supabase } from "@/integrations/supabase/client";

export const WhiteLabelTab = () => {
  const { settings, loading, updateSettings } = useWhiteLabel();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    company_name: "",
    logo_url: "",
    primary_color: "#8B5CF6",
    secondary_color: "#10B981",
    accent_color: "#F59E0B"
  });

  // Domain state
  const [domain, setDomain] = useState("");
  const [currentDomain, setCurrentDomain] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [savingDomain, setSavingDomain] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name || "",
        logo_url: settings.logo_url || "",
        primary_color: settings.primary_color,
        secondary_color: settings.secondary_color,
        accent_color: settings.accent_color
      });
      setLogoPreview(settings.logo_url || "");
      setDomain(settings.custom_domain || "");
      setCurrentDomain(settings.custom_domain || "");
      setVerificationToken(settings.domain_verification_token || "");
      setIsVerified(settings.domain_verified || false);
    }
  }, [settings]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setLogoFile(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${user.id}/logo-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('white-label-logos')
        .upload(fileName, logoFile, {
          upsert: true,
          contentType: logoFile.type
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('white-label-logos')
        .getPublicUrl(fileName);

      setFormData({ ...formData, logo_url: publicUrl });
      toast.success('Logo uploaded successfully');
      setLogoFile(null);
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview("");
    setFormData({ ...formData, logo_url: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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

  const generateVerificationToken = () => {
    return `verify_${Math.random().toString(36).substring(2, 15)}`;
  };

  const handleSaveDomain = async () => {
    if (!domain || !domain.trim()) {
      toast.error("Please enter a domain name");
      return;
    }

    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    if (!domainRegex.test(domain.trim())) {
      toast.error("Please enter a valid domain name");
      return;
    }

    setSavingDomain(true);
    try {
      const token = generateVerificationToken();

      const result = await updateSettings({
        custom_domain: domain.trim().toLowerCase(),
        domain_verification_token: token,
        domain_verified: false,
      });

      if (result.success) {
        setCurrentDomain(domain.trim().toLowerCase());
        setVerificationToken(token);
        setIsVerified(false);
        toast.success("Domain saved! Please add the DNS records to verify.");
      } else {
        toast.error("Failed to save domain");
      }
    } catch (error: any) {
      toast.error("Failed to save domain");
      console.error(error);
    } finally {
      setSavingDomain(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!currentDomain || !verificationToken) {
      toast.error("No domain to verify");
      return;
    }

    try {
      // Call the verify-domain edge function
      const { data, error } = await supabase.functions.invoke('verify-domain', {
        body: {
          domain: currentDomain,
          verificationToken: verificationToken
        }
      });

      if (error) throw error;

      if (data.success) {
        setIsVerified(true);
        toast.success(data.message || "Domain verified successfully!");
      } else {
        // Show detailed error message about missing DNS records
        const missingRecords = data.missingRecords || [];
        toast.error(
          <div className="space-y-2">
            <p className="font-semibold">DNS verification failed</p>
            <p className="text-sm">Missing or incorrect DNS records:</p>
            <ul className="text-xs list-disc list-inside">
              {missingRecords.map((record: string, idx: number) => (
                <li key={idx}>{record}</li>
              ))}
            </ul>
            <p className="text-xs mt-2">Please ensure all DNS records are correctly configured and have propagated.</p>
          </div>,
          { duration: 10000 }
        );
      }
    } catch (error: any) {
      console.error("Error verifying domain:", error);
      toast.error("Failed to verify domain. Please try again later.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
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
            <Label htmlFor="logo">Company Logo</Label>
            <div className="space-y-3">
              {logoPreview ? (
                <div className="relative inline-block">
                  <img 
                    src={logoPreview} 
                    alt="Logo preview" 
                    className="h-20 w-auto max-w-[200px] object-contain border rounded-lg p-2"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={handleRemoveLogo}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Click to upload your logo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, SVG or WEBP (max 5MB, recommended: 200x50px)
                  </p>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                id="logo"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </Button>
                
                {logoFile && (
                  <Button
                    type="button"
                    onClick={handleUploadLogo}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload Logo'
                    )}
                  </Button>
                )}
              </div>
            </div>
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

      {/* Custom Domain Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Custom Domain
          </CardTitle>
          <CardDescription>
            Connect your own domain to serve your branded application
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
                disabled={savingDomain}
              />
              <Button onClick={handleSaveDomain} disabled={savingDomain}>
                {savingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your domain without http:// or https://
            </p>
          </div>

          <div className="space-y-4 border-t pt-6">
            {currentDomain && (
              <div className="flex items-center gap-2 mb-4">
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
            )}

            <div className="space-y-3 bg-muted p-4 rounded-lg">
              <p className="font-semibold text-sm">Required DNS Records:</p>
              
              <div className="space-y-2">
                <div className="bg-background p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">A Record (Root Domain)</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard("185.158.133.1")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Type:</span>
                      <span className="text-xs font-mono">A</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Name:</span>
                      <span className="text-xs font-mono">@</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Value:</span>
                      <span className="text-xs font-mono">185.158.133.1</span>
                    </div>
                  </div>
                </div>

                <div className="bg-background p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">A Record (WWW Subdomain)</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard("185.158.133.1")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Type:</span>
                      <span className="text-xs font-mono">A</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Name:</span>
                      <span className="text-xs font-mono">www</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Value:</span>
                      <span className="text-xs font-mono">185.158.133.1</span>
                    </div>
                  </div>
                </div>

                <div className="bg-background p-3 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">TXT Record (Verification)</p>
                    {currentDomain && verificationToken && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(`${currentDomain}_verify=${verificationToken}`)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Type:</span>
                      <span className="text-xs font-mono">TXT</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16">Name:</span>
                      <span className="text-xs font-mono">_verify</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-16 pt-0.5">Value:</span>
                      <span className="text-xs font-mono break-all flex-1">
                        {currentDomain && verificationToken 
                          ? `${currentDomain}_verify=${verificationToken}`
                          : 'yourdomain.com_verify=TOKEN (generated after saving)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {currentDomain && !isVerified && (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>DNS Propagation</AlertTitle>
                  <AlertDescription className="space-y-1 text-sm">
                    <p>• DNS changes can take up to 72 hours to propagate globally</p>
                    <p>• Use DNSChecker.org to verify your DNS records</p>
                    <p>• SSL certificate will be automatically provisioned after verification</p>
                  </AlertDescription>
                </Alert>

                <Button onClick={handleVerifyDomain} className="w-full">
                  Verify Domain
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