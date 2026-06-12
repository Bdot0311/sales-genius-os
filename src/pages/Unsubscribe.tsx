import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";

type Status = "loading" | "valid" | "already_unsubscribed" | "invalid" | "success" | "error";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setStatus("already_unsubscribed");
        } else if (data.valid) {
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("invalid");
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (data?.success) {
        setStatus("success");
      } else if (data?.reason === "already_unsubscribed") {
        setStatus("already_unsubscribed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-4 overflow-hidden"
      style={{ background: "hsl(261 75% 2%)" }}
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none sm:h-[560px] sm:w-[560px]"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[-140px] right-[-120px] h-[380px] w-[380px] rounded-full hero-orb pointer-events-none sm:h-[480px] sm:w-[480px]"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.14) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-8 backdrop-blur-sm"
        style={{
          background: "hsl(261 75% 50% / 0.04)",
          border: "1px solid hsl(261 75% 50% / 0.14)",
        }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Preferences
          </span>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <MailX className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-2xl text-white">
            Email <span className="text-primary">Preferences</span>
          </h1>
        </div>

        <div className="text-center space-y-4">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-white/60">Validating your request...</p>
            </div>
          )}

          {status === "valid" && (
            <div className="space-y-5">
              <p className="text-white/80">
                Would you like to unsubscribe from future emails?
              </p>
              <Button
                onClick={handleUnsubscribe}
                disabled={processing}
                variant="destructive"
                className="rounded-full gap-2"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Confirm unsubscribe"
                )}
              </Button>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30">
                <CheckCircle className="h-7 w-7 text-green-400" />
              </div>
              <p className="text-white font-medium">You've been unsubscribed.</p>
              <p className="text-sm text-white/55">
                You will no longer receive emails from us.
              </p>
            </div>
          )}

          {status === "already_unsubscribed" && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                <CheckCircle className="h-7 w-7 text-white/55" />
              </div>
              <p className="text-white/80">You're already unsubscribed.</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/30">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-white/80">Invalid or expired link.</p>
              <p className="text-sm text-white/55">
                This unsubscribe link is no longer valid.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/30">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-white/80">Something went wrong.</p>
              <p className="text-sm text-white/55">
                Please try again later or contact support.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Unsubscribe;
