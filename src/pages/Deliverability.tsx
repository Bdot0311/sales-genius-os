import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { HealthOverview } from "@/components/deliverability/HealthOverview";
import { AlertsPanel } from "@/components/deliverability/AlertsPanel";
import { AccountHealthGrid } from "@/components/deliverability/AccountHealthGrid";
import { WarmupPanel } from "@/components/deliverability/WarmupPanel";
import { DomainAuthPanel } from "@/components/deliverability/DomainAuthPanel";
import { PlacementPanel } from "@/components/deliverability/PlacementPanel";
import { SpamCheckerPanel } from "@/components/deliverability/SpamCheckerPanel";
import {
  useSendingAccounts,
  useActiveAlerts,
  useSendingDomains,
  useReputationSnapshots,
} from "@/hooks/use-deliverability";

const SectionHeading = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-3">
    <h2 className="text-sm font-semibold">{title}</h2>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </div>
);

const Deliverability = () => {
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, triggerGate } = usePlanFeatures();
  const gated = !hasFeature("deliverabilityDashboard");

  const accountsQ = useSendingAccounts();
  const alertsQ = useActiveAlerts();
  const domainsQ = useSendingDomains();
  const snapshotsQ = useReputationSnapshots(30);

  const accounts = accountsQ.data ?? [];
  const alerts = alertsQ.data ?? [];
  const domains = domainsQ.data ?? [];
  const snapshots = snapshotsQ.data ?? [];

  const loading = accountsQ.isLoading || alertsQ.isLoading || domainsQ.isLoading;
  const errored = accountsQ.isError || alertsQ.isError || domainsQ.isError;
  const retryAll = () => {
    accountsQ.refetch();
    alertsQ.refetch();
    domainsQ.refetch();
    snapshotsQ.refetch();
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-6">
        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Deliverability
          </h1>
          <p className="text-sm text-muted-foreground">
            Reputation, authentication, blacklists, and content risk for every sending account, in one place.
          </p>
        </div>

        {gated ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">The Deliverability suite is a Growth feature</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reputation scoring, domain auth, blacklist monitoring, and the spam checker unlock on Growth and above.
                </p>
              </div>
              <Button onClick={() => triggerGate("deliverabilityDashboard")}>See plans</Button>
            </CardContent>
          </Card>
        ) : errored ? (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-semibold">Couldn't load deliverability data</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This usually means the deliverability tables haven't been created in the database yet.
                  Apply the latest migrations, then retry.
                </p>
              </div>
              <Button variant="outline" onClick={retryAll}>
                <RefreshCw className="mr-1 h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <HealthOverview accounts={accounts} alerts={alerts} domains={domains} />

            <section>
              <SectionHeading title="Alerts" sub="Reputation drops, auth failures, and blacklist listings surface here." />
              <AlertsPanel alerts={alerts} />
            </section>

            <section>
              <SectionHeading title="Sending accounts" sub="Per-account reputation, updated nightly from real send data." />
              <AccountHealthGrid accounts={accounts} snapshots={snapshots} />
            </section>

            <section>
              <SectionHeading title="Warmup" sub="Shared-pool warmup activity and inbox placement." />
              <WarmupPanel accounts={accounts} />
            </section>

            <section>
              <SectionHeading title="Authentication & blacklists" sub="Live DNS checks for SPF, DKIM, DMARC, and domain blacklists." />
              <DomainAuthPanel />
            </section>

            <section>
              <SectionHeading title="Inbox placement" sub="Send a seed test to see where your mail lands." />
              <PlacementPanel accounts={accounts} />
            </section>

            <section>
              <SectionHeading title="Content check" sub="Score a draft's spam and inbox-placement risk before you send." />
              <SpamCheckerPanel />
            </section>
          </>
        )}
      </div>

      {gatedFeature && (
        <FeatureGateModal
          open={gateModalOpen}
          onOpenChange={setGateModalOpen}
          feature={gatedFeature}
          currentPlan={currentPlan}
        />
      )}
    </DashboardLayout>
  );
};

export default Deliverability;
