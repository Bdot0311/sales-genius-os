import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Loader2, Mail, Sparkles, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type StepState = "ok" | "pending" | "error" | "loading";

interface StatusItemProps {
  state: StepState;
  title: string;
  description: string;
  details?: React.ReactNode;
  action?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}

const STATE_META: Record<StepState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "Verified", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: AlertCircle },
  error: { label: "Issue detected", cls: "bg-red-500/15 text-red-400 border-red-500/30", Icon: XCircle },
  loading: { label: "Checking…", cls: "bg-muted text-muted-foreground border-border", Icon: Loader2 },
};

const StatusRow = ({ state, title, description, details, action, icon: Icon }: StatusItemProps) => {
  const meta = STATE_META[state];
  const StatusIcon = meta.Icon;
  return (
    <div className="flex items-start gap-4 border border-border rounded-xl p-4 bg-card/50">
      <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="outline" className={meta.cls}>
            <StatusIcon className={`h-3 w-3 mr-1 ${state === "loading" ? "animate-spin" : ""}`} />
            {meta.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
        {details && <div className="mt-3 text-sm">{details}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
};

const OnboardingStatus = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [resending, setResending] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/auth");
      return;
    }
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    setUser(freshUser);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan, status, account_status, leads_limit, current_period_end, created_at")
      .eq("user_id", freshUser?.id ?? session.user.id)
      .maybeSingle();
    setSubscription(sub);

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resendVerification = async () => {
    if (!user?.email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
      if (error) throw error;
      toast.success("Verification email sent. Check your inbox.");
    } catch (e: any) {
      toast.error(e.message || "Could not resend verification email.");
    } finally {
      setResending(false);
    }
  };

  const emailVerified = !!user?.email_confirmed_at;
  const planProvisioned = !!subscription;
  const planActive = subscription?.status === "active" && subscription?.account_status === "active";

  const emailState: StepState = loading ? "loading" : emailVerified ? "ok" : "pending";
  const planState: StepState = loading ? "loading" : !planProvisioned ? "error" : planActive ? "ok" : "pending";

  const overall: StepState =
    loading ? "loading"
    : (emailState as string) === "error" || (planState as string) === "error" ? "error"
    : emailState === "ok" && planState === "ok" ? "ok"
    : "pending";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Onboarding status</h1>
          <p className="text-muted-foreground mt-1">
            A clear view of where your account stands. If anything is pending, you'll see how to fix it here.
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Account health
                </CardTitle>
                <CardDescription className="mt-1">
                  {overall === "ok"
                    ? "All set — your account is fully ready."
                    : overall === "loading"
                    ? "Running checks…"
                    : overall === "error"
                    ? "Something needs attention before you can use everything."
                    : "Almost there. Complete the steps below."}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusRow
              state={emailState}
              icon={Mail}
              title="Email verification"
              description={
                emailVerified
                  ? "Your email address is confirmed."
                  : "We need to confirm you own this email before you can use authenticated features."
              }
              details={
                user?.email && (
                  <div className="text-muted-foreground">
                    <span className="text-foreground font-medium">{user.email}</span>
                    {emailVerified && user.email_confirmed_at && (
                      <span> · verified on {new Date(user.email_confirmed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                )
              }
              action={
                !emailVerified && !loading && (
                  <Button size="sm" onClick={resendVerification} disabled={resending}>
                    {resending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Resend verification email
                  </Button>
                )
              }
            />

            <StatusRow
              state={planState}
              icon={Sparkles}
              title="Plan provisioning"
              description={
                !planProvisioned
                  ? "We couldn't find a subscription record for your account. This usually means the auto-provisioning step failed."
                  : planActive
                  ? `You're on the ${String(subscription.plan).toUpperCase()} plan and your account is active.`
                  : `Your subscription exists but is currently ${subscription.account_status}/${subscription.status}.`
              }
              details={
                planProvisioned && (
                  <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-lg p-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="font-medium uppercase">{subscription.plan}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium">{subscription.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Account</p>
                      <p className="font-medium">{subscription.account_status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lead limit</p>
                      <p className="font-medium">{subscription.leads_limit?.toLocaleString() ?? 0}</p>
                    </div>
                  </div>
                )
              }
              action={
                !planProvisioned && !loading ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Try refreshing in a few seconds — provisioning happens automatically right after signup. If the issue persists, contact support.
                    </p>
                    <Button size="sm" variant="outline" asChild>
                      <a href="mailto:support@bdotindustries.com?subject=Plan%20not%20provisioned">Contact support</a>
                    </Button>
                  </div>
                ) : planProvisioned && !planActive ? (
                  <Button size="sm" asChild>
                    <Link to="/pricing">View plans</Link>
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What's next?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button asChild className="flex-1"><Link to="/dashboard">Go to dashboard</Link></Button>
            <Button asChild variant="outline" className="flex-1"><Link to="/dashboard/leads">Find leads</Link></Button>
            <Button asChild variant="outline" className="flex-1"><Link to="/settings">Account settings</Link></Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default OnboardingStatus;
