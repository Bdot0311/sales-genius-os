import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOutcomeConsent, useSetOutcomeConsent } from "@/hooks/use-outcome-consent";
import { useOnboardingGate } from "@/hooks/use-onboarding-gate";

/**
 * The question, asked once, of everybody.
 *
 * It is asked of existing accounts as well as new ones, which is why the
 * stored value is tri-state: an account created before this prompt existed
 * reads as "not asked" and is asked the next time it opens the app, rather
 * than being treated as having agreed. Neither button is pre-selected and
 * there is no default.
 *
 * Closing without answering leaves it unanswered -- the account still
 * contributes nothing -- and the question comes back next visit. It is
 * suppressed for the rest of this browser session so it cannot follow somebody
 * from page to page, and that suppression is per-viewer convenience only: the
 * answer itself lives on the server.
 */
const DEFERRED_KEY = "outreign.outcome-consent.deferred";

const deferredThisSession = (): boolean => {
  try { return sessionStorage.getItem(DEFERRED_KEY) === "1"; } catch { return false; }
};

export const OutcomeConsentPrompt = () => {
  const { loading: gateLoading, needsOnboarding } = useOnboardingGate();
  // Not while somebody is still being set up: the first run has its own job.
  const ready = !gateLoading && !needsOnboarding;
  const { data, isLoading } = useOutcomeConsent(ready);
  const setConsent = useSetOutcomeConsent();
  const [deferred, setDeferred] = useState(deferredThisSession);

  const unanswered = ready && !isLoading && data?.consent === null;

  useEffect(() => {
    if (!deferred) return;
    try { sessionStorage.setItem(DEFERRED_KEY, "1"); } catch { /* private window */ }
  }, [deferred]);

  const answer = async (consent: boolean) => {
    try {
      await setConsent.mutateAsync({ consent, source: "prompt" });
      toast.success(consent
        ? "Thanks. You can change your mind any time in Settings."
        : "Noted. Your data will not be used for this.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your answer was not saved.");
    }
  };

  if (!unanswered || deferred) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setDeferred(true); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Help improve OutReign's lead scoring?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-left">
              <p>
                We can learn which kinds of leads reply from what happens to the emails you send: the
                recipient's seniority, company size, industry and buying signals, what the email looked
                like, and whether you got a reply. It never includes the words of your emails, the
                replies you receive, or anyone's name or email address.
              </p>
              <p>
                It makes the scoring better for you and for everyone else using OutReign. You can change
                your mind any time in Settings.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={() => answer(true)} disabled={setConsent.isPending}>
            {setConsent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Yes, use my outcome data
          </Button>
          <Button variant="outline" onClick={() => answer(false)} disabled={setConsent.isPending}>
            No thanks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
