import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm } from "@/components/auth/AuthForm";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Auth = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
