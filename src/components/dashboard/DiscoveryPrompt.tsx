/**
 * One-question catch-up for accounts that predate the signup questionnaire.
 * Dismissible, and never shown again once answered or dismissed.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { DISCOVERY_OPTIONS } from "@/lib/onboarding-questions";
import { Analytics } from "@/lib/analytics-events";

const DISMISS_KEY = "outreign_discovery_prompt_dismissed";

export const DiscoveryPrompt = () => {
  const [visible, setVisible] = useState(false);
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (localStorage.getItem(DISMISS_KEY)) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("onboarding_responses")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && !data) setVisible(true);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const save = async (channel: string) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("onboarding_responses").upsert(
        {
          user_id: user.id,
          discovery_channel: channel,
          discovery_channel_other: channel === "Other" ? other.trim() || null : null,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      Analytics.onboardingCompleted(channel);
    }
    setSaving(false);
    dismiss();
  };

  if (!visible) return null;

  return (
    <Panel className="border-primary/20">
      <PanelHeader className="flex-row items-start justify-between gap-4 pb-3">
        <div>
          <PanelTitle>Quick one: where did you find OutReign?</PanelTitle>
          <PanelDescription>Helps us know which channels are worth showing up on.</PanelDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </PanelHeader>
      <PanelBody className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {DISCOVERY_OPTIONS.map((o) => (
            <Button
              key={o}
              variant={choice === o ? "default" : "outline"}
              size="sm"
              disabled={saving}
              onClick={() => (o === "Other" ? setChoice(o) : void save(o))}
            >
              {o}
            </Button>
          ))}
        </div>
        {choice === "Other" && (
          <div className="flex gap-2">
            <Input
              placeholder="Where exactly?"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
            <Button size="sm" disabled={saving || other.trim().length < 2} onClick={() => void save("Other")}>
              Send
            </Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
};
