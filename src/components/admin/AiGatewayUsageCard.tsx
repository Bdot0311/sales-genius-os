import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Bot, AlertTriangle } from "lucide-react";
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
      <Card className="border-l-4" style={{ borderLeftColor: "hsl(var(--primary))" }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">AI Gateway Usage</CardTitle>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!usage || !settings) return null;

  const percentage = Math.min(100, Math.round((usage.credits_used / settings.cap) * 100));
  const isWarning = usage.credits_used >= settings.threshold;
  const isCritical = usage.credits_used >= settings.cap;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: "hsl(var(--primary))" }}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">AI Gateway Usage</CardTitle>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold tracking-tight">
            {usage.credits_used.toLocaleString()}
            <span className="text-sm font-medium text-muted-foreground"> / {settings.cap.toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {usage.calls_count.toLocaleString()} calls this period
          </div>
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
      </CardContent>
    </Card>
  );
};
