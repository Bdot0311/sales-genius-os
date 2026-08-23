/**
 * Email gate wrapper for scan results.
 *
 * The scan runs and completes untouched — this only obscures the finished
 * output for anonymous visitors who have not yet left an email. The result
 * count stays visible on purpose: the value has to be visibly earned before
 * the ask, otherwise the gate reads as a paywall on nothing.
 */
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { captureScanGateLead, getStoredGateEmail, isValidEmail } from "@/lib/scan-gate";

interface ScanResultsGateProps {
  /** How many rows the completed scan returned — shown even while gated. */
  resultCount: number;
  /** Anything worth remembering about the scan that triggered the gate. */
  scanContext?: Record<string, unknown> | null;
  children: React.ReactNode;
}

export function ScanResultsGate({ resultCount, scanContext, children }: ScanResultsGateProps) {
  // undefined = still resolving; true = show results, no gate.
  const [unlocked, setUnlocked] = useState<boolean | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (getStoredGateEmail()) {
      setUnlocked(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUnlocked(Boolean(data.session));
    });
    return () => { active = false; };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    // Reveal immediately — the insert and analytics run in the background.
    void captureScanGateLead(email, scanContext);
    setUnlocked(true);
  };

  if (unlocked === undefined) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none blur-[6px] opacity-60 max-h-[420px] overflow-hidden"
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-start justify-center bg-background/70 backdrop-blur-[2px] p-4">
        <div className="mt-8 w-full max-w-md rounded-xl border border-primary/30 bg-card/95 p-6 shadow-xl">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Scan complete</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">
            {resultCount} matching {resultCount === 1 ? "lead is" : "leads are"} ready
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email to reveal the full results.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 space-y-2">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              maxLength={254}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              aria-label="Email address"
              aria-invalid={Boolean(error)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" variant="hero" className="w-full" disabled={submitting}>
              Reveal results
            </Button>
            <p className="text-xs text-muted-foreground text-center">We'll email you a copy.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
