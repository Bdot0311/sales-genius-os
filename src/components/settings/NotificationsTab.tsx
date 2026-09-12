import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

function isPreviewEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top ||
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");
  } catch {
    return true;
  }
}

export default function NotificationsTab() {
  const [inPreview, setInPreview] = useState(false);
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setInPreview(isPreviewEnvironment());
    setSupported(isPushSupported());
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    void getCurrentSubscription().then((subscription) => setSubscribed(Boolean(subscription)));
  }, []);

  const toggle = async (next: boolean) => {
    setLoading(true);
    try {
      if (next) {
        await subscribeToPush();
        toast.success("Push notifications enabled on this device");
      } else {
        await unsubscribeFromPush();
        toast.success("Push notifications disabled on this device");
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to update notifications");
    } finally {
      // Always re-read the real device state so the switch can never lie.
      const current = await getCurrentSubscription().catch(() => null);
      setSubscribed(Boolean(current));
      if (typeof Notification !== "undefined") setPermission(Notification.permission);
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          title: "OutReign test notification",
          body: "If you can see this, push notifications are working.",
          url: "/dashboard",
        },
      });
      if (error) throw error;
      const result = data as { success?: boolean; sent?: number; error?: string };
      if (result?.success) {
        toast.success(`Test sent to ${result.sent ?? 0} device(s)`);
      } else {
        toast.error(result?.error || "Failed to send test notification");
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to send test notification");
    } finally {
      setLoading(false);
    }
  };

  const unavailable = inPreview || !supported;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push notifications
        </CardTitle>
        <CardDescription>
          Receive real-time alerts on this device for new replies, hot leads, and agent activity.
          Install the app to your home screen for the best experience on mobile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {unavailable ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
            <BellOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {inPreview
                ? "Notifications can't be enabled inside this preview. Open the published app in its own browser tab, or install it to your home screen, then turn them on."
                : "Push notifications aren't supported by this browser. On iPhone or iPad, add OutReign to your home screen and open it there."}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between rounded-lg border border-border p-4 gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">Enable on this device</p>
                <p className="text-sm text-muted-foreground">
                  {permission === "denied"
                    ? "Blocked in your browser settings. Allow notifications for this site to enable."
                    : subscribed
                    ? "This device is registered for notifications."
                    : "Turn on to start receiving push notifications here."}
                </p>
              </div>
              <Switch
                className="mt-0.5 shrink-0"
                checked={subscribed}
                disabled={loading || permission === "denied"}
                onCheckedChange={toggle}
              />
            </div>

            <Button
              onClick={sendTest}
              disabled={loading || !subscribed}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bell className="h-4 w-4 mr-2" />
              )}
              Send test notification
            </Button>
            {!subscribed && (
              <p className="text-xs text-muted-foreground">
                Turn the switch on to unlock the test notification.
              </p>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ExternalLink className="h-3 w-3" />
          On iPhone and iPad, add OutReign to your home screen first — Safari only allows
          notifications for installed apps.
        </p>
      </CardContent>
    </Card>
  );
}
