import { ReactNode } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { HealthOverview } from "@/components/deliverability/HealthOverview";
import { AlertsPanel } from "@/components/deliverability/AlertsPanel";
import { AccountHealthGrid } from "@/components/deliverability/AccountHealthGrid";
import { WarmupPanel } from "@/components/deliverability/WarmupPanel";
import { AccountSendLimit } from "@/components/deliverability/AccountSendLimit";
import { OpenTrackingToggle } from "@/components/deliverability/OpenTrackingToggle";
import { DomainAuthPanel } from "@/components/deliverability/DomainAuthPanel";
import { PlacementPanel } from "@/components/deliverability/PlacementPanel";
import { SpamCheckerPanel } from "@/components/deliverability/SpamCheckerPanel";
import { InsightsPanel } from "@/components/deliverability/InsightsPanel";
import { ConnectionHealthGrid } from "@/components/deliverability/ConnectionHealthGrid";
import { EventTimeline } from "@/components/deliverability/EventTimeline";
import { RecoveryLedger } from "@/components/deliverability/RecoveryLedger";
import {
  useSendingAccounts,
  useActiveAlerts,
  useSendingDomains,
  useReputationSnapshots,
  useLiveStats,
} from "@/hooks/use-deliverability";
import { useDeliverabilityRealtime } from "@/hooks/use-deliverability-realtime";
import { LiveIndicator } from "@/components/deliverability/LiveIndicator";

/**
 * A section's label, at the scale the rest of the dashboard uses.
 *
 * This page is twelve sections deep, and every heading was set at the same
 * weight as a panel title with a full sentence under it, so scrolling it read
 * as twelve equally important announcements rather than one page with an
 * order. The label recedes; the panel under it is the content.
 */
const SectionHeading = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="mb-2">
    <h2 className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">{title}</h2>
    {sub && <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">{sub}</p>}
  </div>
);

/** The three states that are not the dashboard: gated, broken, empty. */
const StatePanel = ({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) => (
  <Panel>
    <div className="px-5 py-10 text-center">
      <p className="text-[0.8125rem] font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[0.6875rem] leading-relaxed text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  </Panel>
);

const Deliverability = () => {
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, triggerGate } = usePlanFeatures();
  const gated = !hasFeature("deliverabilityDashboard");

  const accountsQ = useSendingAccounts();
  const alertsQ = useActiveAlerts();
  const domainsQ = useSendingDomains();
  const snapshotsQ = useReputationSnapshots(30);
  const statsQ = useLiveStats(30);
  const { status: liveStatus, lastUpdate } = useDeliverabilityRealtime();

  const accounts = accountsQ.data ?? [];
  const alerts = alertsQ.data ?? [];
  const domains = domainsQ.data ?? [];
  const snapshots = snapshotsQ.data ?? [];
  const stats = statsQ.data ?? [];

  const loading = accountsQ.isLoading || alertsQ.isLoading || domainsQ.isLoading;
  const errored = accountsQ.isError || alertsQ.isError || domainsQ.isError;
  const retryAll = () => {
    accountsQ.refetch();
    alertsQ.refetch();
    domainsQ.refetch();
    snapshotsQ.refetch();
    statsQ.refetch();
  };

  return (
    <DashboardLayout>
      {/* The shared header, like every other page. It hand-rolled an h1 with an
          icon beside it and a paragraph underneath, at a size nothing else in
          the dashboard uses, which is why this page never looked like part of
          the same product. */}
      <PageHeader
        title="Deliverability"
        description="Reputation, authentication, blacklists and content risk for every sending account, in one place."
        actions={!gated ? <LiveIndicator status={liveStatus} lastUpdate={lastUpdate} /> : undefined}
      />
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6">
        {gated ? (
          <StatePanel
            title="The deliverability suite is a Growth feature"
            body="Reputation scoring, domain auth, blacklist monitoring and the spam checker unlock on Growth and above."
            action={<Button size="sm" onClick={() => triggerGate("deliverabilityDashboard")}>See plans</Button>}
          />
        ) : errored ? (
          <StatePanel
            title="Couldn't load deliverability data"
            body="This usually means the deliverability tables haven't been created in the database yet. Apply the latest migrations, then retry."
            action={
              <Button variant="outline" size="sm" onClick={retryAll}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            }
          />
        ) : loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <HealthOverview accounts={accounts} alerts={alerts} domains={domains} snapshots={snapshots} stats={stats} />

            {/* Deliverability: does the mail land. Kept above Connection
                Health, and visually separate from it, because a connected
                mailbox is the precondition and not the outcome. */}
            <section>
              <SectionHeading
                title="Insights"
                sub="What each number means, what caused it, and what to do about it."
              />
              <InsightsPanel domains={domains} stats={stats} />
            </section>

            <section>
              <SectionHeading title="Alerts" sub="Reputation drops, auth failures, and blacklist listings surface here." />
              <AlertsPanel alerts={alerts} />
            </section>

            {/* The save. Users do not credit software for problems they never
                saw, so containment that worked is counted rather than silent. */}
            <section>
              <SectionHeading
                title="Contained automatically"
                sub="Mailboxes pulled before they cost you a domain, and the sends that kept moving."
              />
              <RecoveryLedger />
            </section>

            {/* Uptime. Deliberately not called Insights, and deliberately not
                sharing their green: whether a mailbox is connected says
                nothing about whether its mail reaches anyone. */}
            <section>
              <SectionHeading
                title="Connection health"
                sub="Whether each mailbox can send right now. Not a measure of whether mail lands."
              />
              <ConnectionHealthGrid accounts={accounts} />
            </section>

            <section>
              <SectionHeading
                title="Daily send limit"
                sub="The account-wide ceiling, above the per-mailbox limits below."
              />
              <AccountSendLimit />
            </section>

            <section>
              <SectionHeading
                title="Tracking"
                sub="What every outbound email carries, and what it costs to carry it."
              />
              <OpenTrackingToggle />
            </section>

            <section id="accounts">
              <SectionHeading title="Sending accounts" sub="Per-account reputation, updated nightly from real send data." />
              <AccountHealthGrid accounts={accounts} snapshots={snapshots} stats={stats} />
            </section>

            <section>
              <SectionHeading title="Warmup" sub="Shared-pool warmup activity and inbox placement." />
              <WarmupPanel accounts={accounts} />
            </section>

            <section id="authentication">
              <SectionHeading title="Authentication & blacklists" sub="Live DNS checks for SPF, DKIM, DMARC, and domain blacklists." />
              <DomainAuthPanel />
            </section>

            <section id="placement">
              <SectionHeading title="Inbox placement" sub="Send a seed test to see where your mail lands." />
              <PlacementPanel accounts={accounts} />
            </section>

            {/* Placed under everything it explains: a change here is the answer
                to a shift in any chart above it. */}
            <section>
              <SectionHeading
                title="What changed"
                sub="Every mailbox, limit and DNS change, so a shift in the numbers above has a cause you can point at."
              />
              <EventTimeline />
            </section>

            <section id="content">
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
