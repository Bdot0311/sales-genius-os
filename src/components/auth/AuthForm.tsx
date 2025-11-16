import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import salesosLogo from "@/assets/salesos-logo.png";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface AuthFormProps {
  onSuccess?: () => void;
}

export const AuthForm = ({ onSuccess }: AuthFormProps) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        // Check for common SMTP-related errors
        if (error.message.includes("Email address not authorized") || 
            error.message.includes("Load failed")) {
          toast({
            title: "Email service not configured",
            description: "Please contact support or configure SMTP in your backend settings.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Password reset email sent",
        description: "Check your email for the password reset link.",
      });

      setShowResetDialog(false);
      setResetEmail("");
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send password reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First, try to sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // If user doesn't exist, check if they have a subscription
        if (signInError.message.includes("Invalid login credentials")) {
          // Check Stripe for subscription
          const { data: sessionData } = await supabase.auth.getSession();
          
          toast({
            title: "No account found",
            description: "Please purchase a subscription first to create an account.",
            variant: "destructive",
          });
          
          // Redirect to pricing after a short delay
          setTimeout(() => {
            window.location.href = "/pricing";
          }, 2000);
          return;
        }
        throw signInError;
      }

      // After successful sign in, verify subscription
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: subCheck, error: subError } = await supabase.functions.invoke('check-subscription', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (subError || !subCheck?.subscribed) {
          // Sign out the user
          await supabase.auth.signOut();
          
          toast({
            title: "No active subscription",
            description: "Please purchase a subscription to access your account.",
            variant: "destructive",
          });
          
          setTimeout(() => {
            window.location.href = "/pricing";
          }, 2000);
          return;
        }
      }

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-card border border-border rounded-2xl p-8 shadow-card">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={salesosLogo} alt="SalesOS" className="w-10 h-10" />
            <span className="text-2xl font-bold">SalesOS</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">
            Welcome back
          </h2>
          <p className="text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <Button
            type="submit"
            variant="hero"
            className="w-full"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
            <DialogTrigger asChild>
              <button className="text-sm text-primary hover:underline">
                Forgot Password?
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Enter your email address and we'll send you a link to reset your password.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetLoading}
                >
                  {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Reset Link
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          
          <p className="text-sm text-muted-foreground">
            Don't have a subscription?{" "}
            <a href="/pricing" className="text-primary hover:underline">
              Purchase a plan
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
