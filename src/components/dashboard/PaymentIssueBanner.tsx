import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Row {
  account_status: string | null;
  grace_started_at: string | null;
  grace_period_ends_at: string | null;
  previous_plan: string | null;
}

const DAY = 86_400_000;
const fmt = (d: Date) => d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Shown only while a failed payment can still be recovered. */
export const PaymentIssueBanner = () => {
  const [row, setRow] = useState<Row | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("subscriptions")
        .select("account_status, grace_started_at, grace_period_ends_at, previous_plan")
        .eq("user_id", user.id)
        .maybeSingle();
      if (active) setRow((data as Row) ?? null);
    })();
    return () => { active = false; };
  }, []);

  if (!row?.grace_started_at || row.account_status !== "past_due") return null;

  const started = new Date(row.grace_started_at);
  const finalAt = new Date(started.getTime() + 3 * DAY);
  if (Date.now() >= finalAt.getTime()) return null;

  const inGrace = !!row.grace_period_ends_at && new Date(row.grace_period_ends_at).getTime() > Date.now();
  const plan = row.previous_plan ? row.previous_plan[0].toUpperCase() + row.previous_plan.slice(1) : "paid";

  const openPortal = async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Could not open billing. Try again from Settings.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div role="alert" className="border-b border-primary/40 bg-primary/10 px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <CreditCard className="h-4 w-4 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {inGrace ? "Your last payment didn't go through" : `You're on the Free plan until your payment goes through`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {inGrace
              ? `Your plan stays on until ${fmt(new Date(row.grace_period_ends_at!))}. Update your card to keep everything running.`
              : `Update your card to get your ${plan} plan, credits and automations back. After ${fmt(finalAt)} the subscription ends.`}
          </p>
        </div>
        <Button size="sm" onClick={openPortal} disabled={opening}>
          {opening ? "Opening..." : "Fix payment"}
        </Button>
      </div>
    </div>
  );
};
