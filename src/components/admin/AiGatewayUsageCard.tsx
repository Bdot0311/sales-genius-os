import { useEffect, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/Panel";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface AiGatewayUsage {
  credits_used: number;
  calls_count: number;
  period_start: string;
}

interface AiGatewaySettings {
  cap: number;
  threshold: number;
}

export const AiGatewayUsageCard = () => {
  const [usage, setUsage] = useState<AiGatewayUsage | null>(null);
  const [settings, setSettings] = useState<AiGatewaySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const periodStart = new Date();
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);

      const [{ data: usageData, error: usageError }, { data: settingsData, error: settingsError }] = await Promise.all([
        supabase
          .from("ai_gateway_usage_tracking")
          .select("credits_used, calls_count, period_start")
          .gte("period_start", periodStart.toISOString().split("T")[0])
          .order("period_start", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("admin_settings")
          .select("setting_key, setting_value")
          .in("setting_key", ["ai_gateway_monthly_cap", "ai_gateway_warning_threshold"]),
      ]);

      if (usageError && usageError.code !== "PGRST116") {
        console.error("Error loading AI gateway usage:", usageError);
      }
      if (settingsError) {
        console.error("Error loading AI gateway settings:", settingsError);
      }

      const cap = Number(settingsData?.find((s) => s.setting_key === "ai_gateway_monthly_cap")?.setting_value ?? 5000);
      const threshold = Number(settingsData?.find((s) => s.setting_key === "ai_gateway_warning_threshold")?.setting_value ?? 4000);

      setSettings({ cap, threshold });
      setUsage(usageData ?? { credits_used: 0, calls_count: 0, period_start: periodStart.toISOString().split("T")[0] });
    } catch (error) {
      console.error("Error loading AI gateway usage:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load, 30_000);

  if (loading) {
    return (
      <Panel>
        <PanelHeader title="AI gateway usage" />
        <PanelBody>
          <div className="h-7 w-32 animate-pulse rounded bg-muted" />
        </PanelBody>
      </Panel>
    );
  }

  if (!usage || !settings) return null;

  const percentage = Math.min(100, Math.round((usage.credits_used / settings.cap) * 100));
  const isWarning = usage.credits_used >= settings.threshold;
  const isCritical = usage.credits_used >= settings.cap;

  return (
    <Panel>
      <PanelHeader
        title="AI gateway usage"
        meta={`${usage.calls_count.toLocaleString()} calls this period`}
      />
      <PanelBody className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {usage.credits_used.toLocaleString()}
            <span className="text-[0.8125rem] font-normal text-muted-foreground">
              {" "}of {settings.cap.toLocaleString()}
            </span>
          </p>
        </div>

        <Progress value={percentage} className="h-2" />

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{percentage}% of monthly cap</span>
          <span className="text-muted-foreground">Warn at {Math.round((settings.threshold / settings.cap) * 100)}%</span>
        </div>

        {(isWarning || isCritical) && (
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${isCritical ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-500"}`}>
            <AlertTriangle className="h-4 w-4" />
            {isCritical
              ? "AI Gateway monthly cap reached — agent runs will be blocked."
              : "AI Gateway usage above warning threshold."}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
};
