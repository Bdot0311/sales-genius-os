import { useEffect, useState, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/auth/AuthForm";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const isRecoveryFlow = searchParams.get("type") === "recovery";
  
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(isRecoveryFlow);
  
  // Track if we've already handled the recovery to prevent double-processing
  const recoveryHandled = useRef(false);

  useEffect(() => {
    // Set up a single auth listener that handles both recovery and normal flows
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event, "Recovery flow:", isRecoveryFlow, "Has session:", !!session);
      
      if (isRecoveryFlow) {
        // In recovery flow, show password reset form when we get a session
        if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session && !recoveryHandled.current) {
          console.log("Recovery detected, showing password reset form");
          recoveryHandled.current = true;
          setShowPasswordReset(true);
          setCheckingRecovery(false);
        }
      } else {
        // Normal flow: redirect to dashboard when signed in
        if (event === "SIGNED_IN" && session) {
          navigate("/dashboard");
        }
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isRecoveryFlow) {
        // Recovery flow: check if we have a valid session from the token
        if (session && !recoveryHandled.current) {
          console.log("Existing session found in recovery flow, showing reset form");
          recoveryHandled.current = true;
          setShowPasswordReset(true);
        }
        setCheckingRecovery(false);
      } else {
        // Normal flow: redirect if already logged in
        if (session) {
          navigate("/dashboard");
        }
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
          className="absolute top-4 left-4 z-20 text-muted-foreground hover:text-foreground"
        >
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
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
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 relative">
      <AnimatedBackground />

      <Button
        variant="ghost"
        size="sm"
        asChild
        className="absolute top-4 left-4 z-20 text-muted-foreground hover:text-foreground"
      >
        <Link to="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>
      </Button>

      <div className="relative z-10 w-full max-w-md mx-auto">
        <AuthForm />
      </div>
    </div>
  );
};

export default Auth;
