import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/auth/AuthForm";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo/SEOHead";
import { useWhiteLabel } from "@/hooks/use-white-label";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { settings: wlSettings, isCustomDomain } = useWhiteLabel();

  // Capture agency invite/referral params before the user signs up.
  // Store in sessionStorage so they survive email-verification redirects.
  const inviteToken = useMemo(() => new URLSearchParams(location.search).get("invite"), [location.search]);
  const refCode = useMemo(() => new URLSearchParams(location.search).get("ref"), [location.search]);

  useEffect(() => {
    if (inviteToken) sessionStorage.setItem("agency_invite_token", inviteToken);
    if (refCode) sessionStorage.setItem("agency_ref_code", refCode);
  }, [inviteToken, refCode]);

  // After sign-in or sign-up, attempt to link user to agency if params were present.
  const linkAgency = async (token: string) => {
    const invite = sessionStorage.getItem("agency_invite_token");
    const ref = sessionStorage.getItem("agency_ref_code");
    if (!invite && !ref) return;
    try {
      await supabase.functions.invoke("link-agency-client", {
        body: invite ? { invite_token: invite } : { ref_code: ref },
        headers: { Authorization: `Bearer ${token}` },
      });
      sessionStorage.removeItem("agency_invite_token");
      sessionStorage.removeItem("agency_ref_code");
    } catch (e) {
      console.warn("Agency link failed:", e);
    }
  };

  // Supabase recovery redirects often encode `type=recovery` in the URL hash (after #)
  // not in the query string. We must check BOTH.
  const recoveryType = useMemo(() => {
    const fromQuery = new URLSearchParams(location.search).get("type");
    const hash = location.hash?.startsWith("#") ? location.hash.slice(1) : location.hash;
    const fromHash = new URLSearchParams(hash || "").get("type");
    return fromQuery || fromHash;
  }, [location.search, location.hash]);

  const isRecoveryFlow = recoveryType === "recovery";
  
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(isRecoveryFlow);
  
  // Track if we've already handled the recovery to prevent double-processing
  const recoveryHandled = useRef(false);

  useEffect(() => {
    // Keep checking state in sync if the URL changes (e.g., hash-only changes)
    setCheckingRecovery(isRecoveryFlow);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event, "Recovery flow:", isRecoveryFlow, "Has session:", !!session);

      if (isRecoveryFlow) {
        // In recovery flow, DO NOT redirect to dashboard on SIGNED_IN.
        // Supabase commonly emits SIGNED_IN after verifying the recovery token.
        if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session && !recoveryHandled.current) {
          recoveryHandled.current = true;
          setShowPasswordReset(true);
          setCheckingRecovery(false);
        }
        return;
      }

      // Normal flow: link agency if needed, then redirect to dashboard
      if (event === "SIGNED_IN" && session) {
        await linkAgency(session.access_token);
        navigate("/dashboard");
      }
    });

    // Check for existing session (handles refresh / already-authenticated states)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isRecoveryFlow) {
        if (session && !recoveryHandled.current) {
          recoveryHandled.current = true;
          setShowPasswordReset(true);
        }
        setCheckingRecovery(false);
        return;
      }

      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, isRecoveryFlow]);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setResetting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast({
        title: "Password updated!",
        description: "Your password has been successfully reset. Please sign in with your new password.",
      });

      // Sign out and redirect to clean auth page
      await supabase.auth.signOut();
      setShowPasswordReset(false);
      recoveryHandled.current = false;
      navigate("/auth", { replace: true });
    } catch (error: any) {
      console.error("Password update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  // Show loading while checking recovery state
  if (checkingRecovery) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 relative">
        <AnimatedBackground />
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // Show password reset form when in recovery mode
  if (showPasswordReset) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 relative">
        <AnimatedBackground />

        <Button
          variant="ghost"
          size="sm"
          asChild
          className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] left-[calc(1rem+env(safe-area-inset-left,0px))] z-20 text-muted-foreground hover:text-foreground"
        >
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Home
          </Link>
        </Button>

        <div className="relative z-10 w-full max-w-md mx-auto">
          <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl shadow-primary/5">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Reset Your Password</h2>
              <p className="text-muted-foreground">
                Enter your new password below
              </p>
            </div>

            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                  minLength={8}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
              </div>

              <Button
                type="submit"
                variant="hero"
                className="w-full"
                disabled={resetting}
              >
                {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Default: show sign in / sign up form
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-[var(--mobile-page-gutter)] pt-20 pb-8 sm:p-6 relative">
      <SEOHead
        title="Sign in or create your account"
        description="Sign in to SalesOS or create an account to start finding qualified B2B leads with AI-drafted outreach."
        noIndex
      />
      <AnimatedBackground />

      <Button
        variant="ghost"
        size="sm"
        asChild
        className="absolute top-[calc(1.25rem+env(safe-area-inset-top,0px))] left-[calc(var(--mobile-page-gutter)+env(safe-area-inset-left,0px))] z-20 text-muted-foreground hover:text-foreground"
      >
        <Link to="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Home
        </Link>
      </Button>

      <div className="relative z-10 w-full max-w-md mx-auto space-y-4">
        {/* Show agency branding on custom domains, SalesOS branding on own domain */}
        {isCustomDomain && wlSettings ? (
          <div className="flex flex-col items-center gap-3 mb-2">
            {wlSettings.logo_url ? (
              <img src={wlSettings.logo_url} alt={wlSettings.company_name || "Logo"} className="h-10 object-contain" />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                style={{ background: wlSettings.primary_color || "#8B5CF6" }}
              >
                {(wlSettings.company_name || "A").charAt(0).toUpperCase()}
              </div>
            )}
            {wlSettings.company_name && (
              <h1 className="text-xl font-semibold">{wlSettings.company_name}</h1>
            )}
          </div>
        ) : null}
        <div className="text-center px-0 space-y-2">
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Already have access? Sign in below. New here? You can explore the workflow first, then choose the plan that fits your outbound needs.
          </p>
          <p className="text-xs text-muted-foreground/80 max-w-sm mx-auto leading-relaxed">
            If your account needs a paid plan to continue, SalesOS will point you to pricing during setup.
          </p>
        </div>
        <AuthForm />
      </div>
    </div>
  );
};

export default Auth;
