import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/**
 * Whether outbound carries an open-tracking pixel.
 *
 * deliverability_preferences.open_tracking_enabled was created with a comment
 * saying the UI would make the cost visible rather than changing the default
 * silently — and then nothing wrote it and send-email never read it. Every
 * account has been sending a pixel it was never offered a way to decline.
 *
 * The cost is real and one-directional. A remote image in a cold email is a
 * spam signal, and the number it buys back is not reliable enough to pay for
 * it: Gmail proxies every image on delivery and Apple Mail Privacy Protection
 * loads them whether or not anyone read the message. Our own tiles already
 * filter those out, which is why the figure here is lower than the 40-55% the
 * industry quotes — those are counting machines.
 *
 * The copy says what turning it off costs as well as what it buys, because a
 * toggle that only argues one way is not a choice.
 */
export function OpenTrackingToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("deliverability_preferences")
        .select("open_tracking_enabled")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      // No row yet means defaults, and the column default is on.
      setEnabled(data ? data.open_tracking_enabled !== false : true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: boolean) => {
    setSaving(true);
    const previous = enabled;
    setEnabled(next);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      // upsert, because most accounts have no preferences row until they
      // change something here.
      const { error } = await supabase
        .from("deliverability_preferences")
        .upsert(
          { user_id: auth.user.id, open_tracking_enabled: next },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      toast.success(
        next
          ? "Open tracking on. New sends carry a pixel."
          : "Open tracking off. New sends carry no pixel — reply rate is your signal now.",
      );
    } catch (err) {
      setEnabled(previous ?? true);
      toast.error(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-6 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="open-tracking" className="text-sm font-medium">
            Open tracking
          </Label>
          <p className="max-w-prose text-xs text-muted-foreground">
            A 1×1 image in every email, loaded when it renders. It is the only way to
            measure opens and it costs inbox placement: a remote image in a cold email
            is a spam signal. The number is unreliable either way — Gmail proxies every
            image on delivery and Apple Mail Privacy Protection loads them whether or
            not anyone read the message.
          </p>
          <p className="max-w-prose text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Turning it off</span> stops
            the open rate and the opens-over-time chart from moving on new sends. Click
            tracking, replies and bounces are unaffected — clicks rewrite a link the
            reader chose to follow, which costs nothing in placement.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            id="open-tracking"
            checked={enabled ?? true}
            disabled={enabled === null || saving}
            onCheckedChange={(v) => void save(v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
