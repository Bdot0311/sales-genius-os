import { useEffect, useState } from "react";
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
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);

  useEffect(() => {
    const type = searchParams.get("type");
    
    // Handle recovery flow - check if user came from password reset email
    if (type === "recovery") {
      // Listen for the PASSWORD_RECOVERY event from Supabase
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Auth event:", event);
        if (event === "PASSWORD_RECOVERY") {
          setShowPasswordReset(true);
          setCheckingRecovery(false);
        } else if (event === "SIGNED_IN" && session) {
          // User is now signed in from recovery link, show password form
          setShowPasswordReset(true);
          setCheckingRecovery(false);
        }
      });

      // Also check current session in case event already fired
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setShowPasswordReset(true);
        }
        setCheckingRecovery(false);
      });

      return () => subscription.unsubscribe();
    } else {
      setCheckingRecovery(false);
    }

    // Check if user is already logged in (for non-recovery flows)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && type !== "recovery") {
        navigate("/dashboard");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !showPasswordReset && type !== "recovery") {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams, showPasswordReset]);

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
        description: "Your password has been successfully reset.",
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      setShowPasswordReset(false);
      navigate("/auth");
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
  if (checkingRecovery && searchParams.get("type") === "recovery") {
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

  // Show password reset form
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
