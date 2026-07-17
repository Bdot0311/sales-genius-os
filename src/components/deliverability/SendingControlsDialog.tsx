import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateAccount } from "@/hooks/use-deliverability";
import type { SendingAccount } from "@/lib/deliverability-db";

export const SendingControlsDialog = ({ account }: { account: SendingAccount }) => {
  const update = useUpdateAccount();
  const [open, setOpen] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(account.daily_limit);
  const [minDelay, setMinDelay] = useState(account.min_send_delay_seconds);
  const [maxDelay, setMaxDelay] = useState(account.max_send_delay_seconds);
  const [threshold, setThreshold] = useState(account.auto_pause_threshold);

  const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v || 0)));

  const save = async () => {
    const min = clampInt(minDelay, 0, 3600);
    const max = clampInt(maxDelay, min, 7200);
    try {
      await update.mutateAsync({
        id: account.id,
        patch: {
          daily_limit: clampInt(dailyLimit, 1, 2000),
          min_send_delay_seconds: min,
          max_send_delay_seconds: max,
          auto_pause_threshold: clampInt(threshold, 0, 100),
        },
      });
      toast.success("Sending controls saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="Sending controls">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate text-base">Sending controls — {account.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field
            label="Daily send limit"
            hint="Max emails from this mailbox per day. Enforced at send time."
          >
            <Input type="number" min={1} max={2000} value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min delay (s)" hint="Between automated sends.">
              <Input type="number" min={0} max={3600} value={minDelay}
                onChange={(e) => setMinDelay(Number(e.target.value))} />
            </Field>
            <Field label="Max delay (s)" hint="Randomized up to this.">
              <Input type="number" min={0} max={7200} value={maxDelay}
                onChange={(e) => setMaxDelay(Number(e.target.value))} />
            </Field>
          </div>

          <Field
            label="Auto-pause threshold"
            hint="Sending pauses automatically if reputation drops below this."
          >
            <Input type="number" min={0} max={100} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))} />
          </Field>

          <p className="text-xs text-muted-foreground">
            Daily limit and pause state apply to the interactive sender now. Delays and rotation
            apply to automated sequences as they roll out.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);
