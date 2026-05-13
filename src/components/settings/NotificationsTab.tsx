import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
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

export default function NotificationsTab() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if ("Notification" in window) setPermission(Notification.permission);
    if (ok) getCurrentSubscription().then((s) => setSubscribed(!!s));
  }, []);

  const toggle = async (next: boolean) => {
    setLoading(true);
    try {
      if (next) {
        await subscribeToPush();
        setSubscribed(true);
        setPermission(Notification.permission);
        toast.success("Push notifications enabled");
      } else {
        await unsubscribeFromPush();
        setSubscribed(false);
        toast.success("Push notifications disabled");
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to update notifications");
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          title: "SalesOS test notification",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push notifications
        </CardTitle>
        <CardDescription>
          Receive real-time alerts on this device for new replies, hot leads, and workflow events.
          Install the app to your home screen for the best experience on mobile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
            <BellOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Push notifications are not available in this preview. Open the published app
              (or install it to your home screen on iOS 16.4+) to enable notifications.
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
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
                checked={subscribed}
                disabled={loading || permission === "denied"}
                onCheckedChange={toggle}
              />
            </div>

            {subscribed && (
              <Button onClick={sendTest} disabled={loading} variant="outline">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                Send test notification
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
