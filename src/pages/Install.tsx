import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  Download,
  Smartphone,
  Zap,
  WifiOff,
  Share,
  PlusSquare,
  ArrowLeft,
  Check,
  Monitor,
} from "lucide-react";
import salesosLogo from "@/assets/salesos-logo-64.webp";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Detect if already installed (standalone mode)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (standalone) setIsInstalled(true);

    // Listen for the beforeinstallprompt event (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful install
    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const benefits = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Loads instantly from your home screen, no browser needed",
    },
    {
      icon: WifiOff,
      title: "Works Offline",
      description: "Access cached data even without an internet connection",
    },
    {
      icon: Smartphone,
      title: "App-Like Experience",
      description: "Full-screen, no browser bars, just like a native app",
    },
    {
      icon: Monitor,
      title: "Works Everywhere",
      description: "Install on your phone, tablet, or desktop computer",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={salesosLogo} alt="SalesOS" className="w-8 h-8 rounded-lg" />
          <span className="text-lg font-bold">Install SalesOS</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mx-auto">
            <Download className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Get SalesOS on Your Device
          </h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Install SalesOS for instant access to your sales tools — right from your home screen.
          </p>
        </div>

        {/* Already installed */}
        {isInstalled && (
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Check className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-accent">Already Installed!</h3>
                <p className="text-sm text-muted-foreground">
                  SalesOS is installed on this device. Open it from your home screen for the best experience.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Install button (Chrome/Edge/Android) */}
        {!isInstalled && deferredPrompt && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 text-center space-y-4">
              <h2 className="text-xl font-semibold">Ready to Install</h2>
              <p className="text-muted-foreground">
                Click the button below to install SalesOS on your device.
              </p>
              <Button size="lg" onClick={handleInstall} className="gap-2">
                <Download className="w-5 h-5" />
                Install SalesOS
              </Button>
            </CardContent>
          </Card>
        )}

        {/* iOS Instructions */}
        {!isInstalled && isIOS && !deferredPrompt && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Install on iPhone / iPad</h2>
                <Badge variant="secondary">Safari</Badge>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Tap the Share button</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Look for the <Share className="w-4 h-4 inline" /> icon at the bottom of Safari
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Tap "Add to Home Screen"</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Look for the <PlusSquare className="w-4 h-4 inline" /> icon in the share menu
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Tap "Add"</p>
                    <p className="text-sm text-muted-foreground">
                      SalesOS will appear on your home screen
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generic fallback for unsupported browsers */}
        {!isInstalled && !isIOS && !deferredPrompt && !isStandalone && (
          <Card className="border-border">
            <CardContent className="p-6 text-center space-y-3">
              <h2 className="text-xl font-semibold">Install from Your Browser</h2>
              <p className="text-muted-foreground">
                Open SalesOS in <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Safari</strong> and look for the install option in your browser's menu.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-center">Why Install?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="border-border/50">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pt-4">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Continue to Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Install;
