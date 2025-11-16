import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import salesosLogo from "@/assets/salesos-logo.png";

interface AuthFormProps {
  onSuccess?: () => void;
}

export const AuthForm = ({ onSuccess }: AuthFormProps) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

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

        <div className="mt-6 text-center">
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
