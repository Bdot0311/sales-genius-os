import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast({
          title: "Google sign-in failed",
          description: result.error.message || "Please try again or use email instead.",
          variant: "destructive",
        });
        setGoogleLoading(false);
        return;
      }
      if (result.redirected) return;
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: "Google sign-in failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGoogleLoading(false);
    }
  };


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
        if (signInError.message.includes("Invalid login credentials")) {
          toast({
            title: "Sign in failed",
            description:
              "That email and password don't match an account. If you just signed up, please verify your email first, or use \"Forgot Password\" to reset it.",
            variant: "destructive",
          });
          return;
        }
        if (signInError.message.toLowerCase().includes("email not confirmed")) {
          toast({
            title: "Verify your email",
            description:
              "Please click the verification link we sent to your inbox before signing in.",
            variant: "destructive",
          });
          return;
        }
        throw signInError;
      }

      // After successful sign in, check if user is admin (skip subscription check for admins)
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Record login in history (fire-and-forget)
        void supabase.rpc('record_user_login', {
          p_user_id: session.user.id,
          p_user_email: session.user.email ?? '',
          p_login_method: 'password',
          p_status: 'success',
        }).then(null, () => {/* non-critical */});

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

        // For non-admin users, allow login regardless of subscription status.
        // The dashboard and feature gates handle access control.
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
      // Capture signup source from URL params or referrer
      const urlParams = new URLSearchParams(window.location.search);
      const utmSource = urlParams.get('utm_source');
      const utmMedium = urlParams.get('utm_medium');
      const utmCampaign = urlParams.get('utm_campaign');
      const ref = urlParams.get('ref');
      const referrer = document.referrer;

      let signupSource = 'Direct';
      if (utmSource) {
        signupSource = utmSource + (utmMedium ? ` / ${utmMedium}` : '') + (utmCampaign ? ` (${utmCampaign})` : '');
      } else if (ref) {
        signupSource = `Ref: ${ref}`;
      } else if (referrer) {
        try {
          const refHost = new URL(referrer).hostname.replace('www.', '');
          if (!refHost.includes(window.location.hostname.replace('www.', ''))) {
            signupSource = refHost;
          }
        } catch { /* ignore invalid referrer */ }
      }

      // Validate the email is real (syntax, disposable check, MX lookup) before
      // creating the account. We fail-OPEN on validator unreachable / network
      // hiccup: blocking real users out of signup because a side service is
      // down is a worse outcome than letting one suspicious signup through —
      // the trial / credit limits already cap abuse.
      try {
        const { data: vData, error: vErr } = await supabase.functions.invoke('validate-email', {
          body: { email },
        });
        if (!vErr && vData && vData.valid === false) {
          toast({
            title: "Please use a valid email",
            description: vData?.reason || "That email address can't be used to sign up. Please use a real business address.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        if (vErr) {
          console.warn('Email validator returned an error; allowing signup to proceed:', vErr);
        }
      } catch (err) {
        console.warn('Email validation unreachable; allowing signup to proceed:', err);
      }

      // Create the account — the DB trigger (handle_new_user_subscription)
      // will automatically provision a free-tier subscription.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { signup_source: signupSource },
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
        const displayName = data.user.user_metadata?.full_name || email.split('@')[0];
        supabase.functions.invoke('send-welcome-email', {
          body: { 
            email: data.user.email,
            name: displayName
          }
        }).catch(err => console.error('Welcome email error:', err));

        // Send personal founder note in background
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'founder-note',
            recipientEmail: data.user.email,
            idempotencyKey: `founder-note-${data.user.id}`,
            templateData: { name: displayName },
          }
        }).catch(err => console.error('Founder note error:', err));

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
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-2xl shadow-primary/5 sm:p-8">
        {/* Logo with staggered animation */}
        <div className="text-center mb-8">
          <div 
            className="flex items-center justify-center gap-2 mb-4 animate-scale-in"
            style={{ animationDelay: '0.1s', animationFillMode: 'both' }}
          >
            <img 
              src={salesosLogo} 
              alt="SalesOS Logo" 


              className="w-10 h-10 transition-transform duration-300 hover:scale-110" 
            />
            <span className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">SalesOS</span>
          </div>
          <h2 
            className="text-2xl font-bold mb-2 animate-fade-in"
            style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
          >
            {mode === "signin" ? "Welcome back" : "Get started with SalesOS"}
          </h2>
          <p 
            className="text-muted-foreground animate-fade-in"
            style={{ animationDelay: '0.3s', animationFillMode: 'both' }}
          >
            {mode === "signin" 
              ? "Sign in to your account — no subscription required"
              : "Create your free account. Upgrade only when you're ready."
            }
          </p>
        </div>

        <div className="mb-5 space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full bg-card hover:bg-muted border-border/60"
            onClick={handleGoogleAuth}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.6 6.8 29 5 24 5 16.3 5 9.7 9 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 43c5 0 9.5-1.9 12.9-5l-6-5.1C29 34.4 26.6 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 38.9 16.2 43 24 43z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.4l6 5.1C40.9 35.5 43.5 30.2 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
              </svg>
            )}
            Continue with Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
            </div>
          </div>
        </div>


        <Tabs 
          value={mode} 
          onValueChange={(v) => setMode(v as "signin" | "signup")} 
          className="w-full animate-fade-in"
          style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
        >
          <TabsList className="grid w-full grid-cols-2 mb-6 overflow-hidden bg-muted/50">
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

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Free forever — no credit card required. Includes 10 free lead searches to try the platform.
              </p>

            </form>
          </TabsContent>
        </Tabs>

        <div 
          className="mt-6 text-center animate-fade-in"
          style={{ animationDelay: '0.5s', animationFillMode: 'both' }}
        >
          <p className="text-sm text-muted-foreground">
            Curious about paid plans?{" "}
            <a href="/pricing" className="text-primary hover:underline transition-colors duration-200">
              View pricing
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
