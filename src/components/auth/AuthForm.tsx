import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import salesosLogo from "@/assets/salesos-logo.webp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);

    try {
      const { error } = await supabase.functions.invoke('reset-password', {
        body: { email: resetEmail }
      });

      if (error) throw error;

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
        description: "Failed to send password reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
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

      // After successful sign in, check if user is admin (skip subscription check for admins)
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // First check if user is an admin
        const { data: adminCheck } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'admin')
          .single();

        // If admin, skip subscription check entirely
        if (adminCheck?.role === 'admin') {
          toast({
            title: "Welcome back, Admin!",
            description: "You have successfully signed in.",
          });
          onSuccess?.();
          return;
        }

        // For non-admin users, verify subscription
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First check if user has an active subscription
      const { data: subData, error: subError } = await supabase.functions.invoke(
        "check-subscription",
        {
          body: { email },
        }
      );

      if (subError || !subData?.subscribed) {
        toast({
          title: "No active subscription found",
          description: "Please purchase a subscription or start a trial before creating an account.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/pricing";
        }, 1500);
        return;
      }

      // If subscription exists, create the account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      if (data.user) {
        // Track signup conversion in Google Analytics
        if (typeof window !== 'undefined' && (window as any).gtag) {
          (window as any).gtag('event', 'sign_up', {
            method: 'email',
            user_id: data.user.id,
          });
        }

        // Send welcome email in background
        supabase.functions.invoke('send-welcome-email', {
          body: { 
            email: data.user.email,
            name: data.user.user_metadata?.full_name || email.split('@')[0]
          }
        }).catch(err => console.error('Welcome email error:', err));

        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
        });
        setMode("signin");
      }
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
    <div className="w-full max-w-md animate-fade-in">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl shadow-primary/5">
        {/* Logo with staggered animation */}
        <div className="text-center mb-8">
          <div 
            className="flex items-center justify-center gap-2 mb-4 animate-scale-in"
            style={{ animationDelay: '0.1s', animationFillMode: 'both' }}
          >
            <img 
              src={salesosLogo} 
              alt="SalesOS" 
              className="w-10 h-10 transition-transform duration-300 hover:scale-110" 
            />
            <span className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">SalesOS</span>
          </div>
          <h2 
            className="text-2xl font-bold mb-2 animate-fade-in"
            style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
          >
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p 
            className="text-muted-foreground animate-fade-in"
            style={{ animationDelay: '0.3s', animationFillMode: 'both' }}
          >
            {mode === "signin" 
              ? "Sign in to your account"
              : "Sign up to access your subscription"
            }
          </p>
        </div>

        <Tabs 
          value={mode} 
          onValueChange={(v) => setMode(v as "signin" | "signup")} 
          className="w-full animate-fade-in"
          style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
        >
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/50">
            <TabsTrigger value="signin" className="transition-all duration-200">Sign In</TabsTrigger>
            <TabsTrigger value="signup" className="transition-all duration-200">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <div className="space-y-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
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

              <div className="text-center">
                <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                  <DialogTrigger asChild>
                    <button type="button" className="text-sm text-primary hover:underline">
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
                    <form
                      onSubmit={(e) => {
                        e.stopPropagation();
                        handleResetPassword(e);
                      }}
                      className="space-y-4"
                    >
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
                      <Button type="submit" className="w-full" disabled={resetLoading}>
                        {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send Reset Link
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Create a secure password (8+ chars)"
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">Minimum 8 characters required</p>
              </div>

              <Button
                type="submit"
                variant="hero"
                className="w-full"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Note: You need an active subscription to create an account
              </p>
            </form>
          </TabsContent>
        </Tabs>

        <div 
          className="mt-6 text-center animate-fade-in"
          style={{ animationDelay: '0.5s', animationFillMode: 'both' }}
        >
          <p className="text-sm text-muted-foreground">
            Don't have a subscription?{" "}
            <a href="/pricing" className="text-primary hover:underline transition-colors duration-200">
              Purchase a plan
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
