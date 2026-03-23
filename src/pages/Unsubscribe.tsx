import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";

type Status = "loading" | "valid" | "already_unsubscribed" | "invalid" | "success" | "error";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setStatus("already_unsubscribed");
        } else if (data.valid) {
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("invalid");
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (data?.success) {
        setStatus("success");
      } else if (data?.reason === "already_unsubscribed") {
        setStatus("already_unsubscribed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <MailX className="h-6 w-6 text-muted-foreground" />
            Email Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Validating your request...</p>
            </div>
          )}

          {status === "valid" && (
            <div className="space-y-4">
              <p className="text-foreground">
                Would you like to unsubscribe from future emails?
              </p>
              <Button onClick={handleUnsubscribe} disabled={processing} variant="destructive">
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Confirm Unsubscribe"
                )}
              </Button>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="text-foreground font-medium">You've been unsubscribed.</p>
              <p className="text-sm text-muted-foreground">
                You will no longer receive emails from us.
              </p>
            </div>
          )}

          {status === "already_unsubscribed" && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-10 w-10 text-muted-foreground" />
              <p className="text-foreground">You're already unsubscribed.</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-foreground">Invalid or expired link.</p>
              <p className="text-sm text-muted-foreground">
                This unsubscribe link is no longer valid.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-foreground">Something went wrong.</p>
              <p className="text-sm text-muted-foreground">
                Please try again later or contact support.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
