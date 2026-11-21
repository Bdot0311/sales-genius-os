import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Switch } from "@/components/ui/switch";
import { describeConsent, useOutcomeConsent, useSetOutcomeConsent } from "@/hooks/use-outcome-consent";

/**
 * The Settings row, which has to report the stored state honestly.
 *
 * A switch has two positions and the setting has three, so the position alone
 * cannot be the whole answer: "Not set" is printed beside it until the account
 * has answered, and an unanswered question shows the switch off without
 * claiming the account said no.
 */
export const OutcomeConsentCard = () => {
  const { data, isLoading, isError } = useOutcomeConsent();
  const setConsent = useSetOutcomeConsent();

  const answer = async (consent: boolean) => {
    try {
      await setConsent.mutateAsync({ consent, source: "settings" });
      toast.success(consent
        ? "Thanks. Your send outcomes will help improve the scoring."
        : "Turned off. Your data will not be used for this from now on.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your answer was not saved.");
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Help improve lead scoring</PanelTitle>
        <PanelDescription>
          Share how your emails performed, with no message content and no contact details.
        </PanelDescription>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">
              We use the recipient's seniority, company size, industry and buying signals as they stood
              at the time of sending, what the email looked like, and whether you got a reply. Never the
              words of your emails or replies, and never anyone's name or email address.
            </p>
            <p className="text-xs text-muted-foreground">
              Turning this off changes nothing else about your account, and you are not charged
              differently either way. Your own reporting keeps working whichever you choose.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : (
                <Switch
                  checked={data?.consent === true}
                  disabled={isError || setConsent.isPending}
                  onCheckedChange={answer}
                  aria-label="Help improve lead scoring"
                />
              )}
            <span className="text-xs text-muted-foreground">
              {isError ? "Could not load" : describeConsent(data)}
            </span>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
};
