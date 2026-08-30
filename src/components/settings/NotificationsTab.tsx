import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  disableFcmPush,
  enableFcmPush,
  getExistingFcmToken,
  isFcmConfigured,
  isInPreviewFrame,
} from "@/lib/fcm";

export default function NotificationsTab() {
  const [configured, setConfigured] = useState(true);
  const [inPreview, setInPreview] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setConfigured(isFcmConfigured());
    setInPreview(isInPreviewFrame());
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    void getExistingFcmToken().then((t) => setSubscribed(!!t));
  }, []);

  const toggle = async (next: boolean) => {
    setLoading(true);
    try {
      if (next) {
        const result = await enableFcmPush();
        if (result.status === "registered") {
          setSubscribed(true);
          setPermission("granted");
          toast.success("Push notifications enabled on this device");
        } else if (result.status === "open-in-new-tab") {
          toast.error("Open the app in its own browser tab (or install it to your home screen) to enable notifications.");
        } else if (result.status === "denied") {
          setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
          toast.error("Notifications were blocked. Allow them for this site in your browser settings.");
        } else if (result.status === "unsupported") {
          toast.error("This browser does not support push notifications.");
        } else {
          toast.error("Push notifications are not configured yet.");
        }
      } else {
        await disableFcmPush();
        setSubscribed(false);
        toast.success("Push notifications disabled on this device");
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
      const { data, error } = await supabase.functions.invoke("send-fcm-notification", {
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

  const unavailable = !configured || inPreview;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push notifications
        </CardTitle>
        <CardDescription>
          Receive real-time alerts on this device for new replies, hot leads, and agent activity.
          Install the app to your home screen for the best experience on mobile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unavailable ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
            <BellOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {!configured
                ? "Push notifications aren't finished setting up yet. The workspace still needs its web push keys (Firebase web API key and Web Push VAPID key) added before devices can register. We'll turn this on shortly."
                : "Notifications can't be enabled inside this preview frame. Open the app in its own browser tab, or install it to your home screen (iOS 16.4+), then turn them on."}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-4 gap-4">
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

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ExternalLink className="h-3 w-3" />
          On iPhone and iPad, add OutReign to your home screen first — Safari only allows
          notifications for installed apps.
        </p>
      </CardContent>
    </Card>
  );
}
