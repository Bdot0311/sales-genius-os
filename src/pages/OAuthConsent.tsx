import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

// Typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthAuthorizationDetails = {
  client?: { name?: string; client_uri?: string; redirect_uris?: string[] } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResult<T> = { data: T | null; error: { message: string } | null };
interface OAuthApi {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult<OAuthAuthorizationDetails>>;
  approveAuthorization: (id: string) => Promise<OAuthResult<{ redirect_url?: string; redirect_to?: string }>>;
  denyAuthorization: (id: string) => Promise<OAuthResult<{ redirect_url?: string; redirect_to?: string }>>;
}
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      setUserEmail(sess.session.user.email ?? null);
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-5 h-5" />
            <CardTitle className="text-lg font-semibold">
              Connect {details?.client?.name ?? "an app"} to OutReign
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !details ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading authorization request…
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {details.client?.name ?? "This client"} will be able to call OutReign tools
                while you are signed in{userEmail ? ` as ${userEmail}` : ""}.
              </p>
              <ul className="text-sm space-y-1.5 text-foreground/90">
                <li>• Read your leads, sequences, sent emails, and inbox replies.</li>
                <li>• Act only as you — row-level security still applies.</li>
                <li>• Share your basic profile and email address.</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                This does not bypass OutReign's permissions or backend policies. You can
                revoke access at any time from your account settings.
              </p>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => decide(true)}
                  disabled={busy}
                  className="flex-1"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
                </Button>
                <Button
                  onClick={() => decide(false)}
                  disabled={busy}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel connection
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
