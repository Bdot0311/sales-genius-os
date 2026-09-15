import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PipelineColumn } from "@/components/dashboard/PipelineColumn";
import { AddDealDialog } from "@/components/dashboard/AddDealDialog";
import { Button } from "@/components/ui/button";
import { Panel, MetricStrip, type Metric } from "@/components/dashboard/Panel";
import { Plus, Sparkles, Settings, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

interface Deal {
  id: string;
  title: string;
  company_name: string;
  value: number;
  probability: number;
  stage: string;
}

/**
 * Stage colour is a progression, not a palette.
 *
 * Seven saturated hues — blue, purple, green, yellow, orange, emerald, red —
 * read as seven unrelated categories, which is the opposite of what a pipeline
 * is. A deal moves along one axis, so the marker deepens along it: dim at the
 * top of the funnel, full strength at the bottom. The two terminal states are
 * the only ones that leave the ramp, because won and lost are genuinely not
 * further along than negotiation — they are off it.
 */
const stages = [
  { name: "New", key: "new", color: "bg-primary/25" },
  { name: "Contacted", key: "contacted", color: "bg-primary/40" },
  { name: "Qualified", key: "qualified", color: "bg-primary/55" },
  { name: "Proposal", key: "proposal", color: "bg-primary/70" },
  { name: "Negotiation", key: "negotiation", color: "bg-primary/85" },
  { name: "Closed Won", key: "closed-won", color: "bg-emerald-500" },
  { name: "Closed Lost", key: "closed-lost", color: "bg-muted-foreground/40" },
];

const Pipeline = () => {
  const { toast } = useToast();
  const { currentPlan, features, loading: planLoading, gateModalOpen, setGateModalOpen, gatedFeature, triggerGate } = usePlanFeatures();
  const isFreeTier = currentPlan === 'free';

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  useEffect(() => {
    loadDeals();
  }, []);

  useRealtimeTable({
    channel: "pipeline-deals",
    table: "deals",
    enabled: true,
    onChange: () => loadDeals(),
  });

  const loadDeals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase.from("deals").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      setDeals(data || []);
    } catch (error: any) {
      toast({ title: "Error loading deals", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const money = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${Math.round(n).toLocaleString()}`;

  /**
   * What the board adds up to.
   *
   * Every number here was already on the page, split across seven column
   * headings — so answering "what is my pipeline worth" meant adding them up by
   * eye, on the one page built to answer it. Open excludes the two terminal
   * stages; weighted is the same set multiplied by each deal's own probability,
   * which is what the Forecast button used to put in a toast and then throw
   * away.
   */
  const open = deals.filter((d) => d.stage !== "closed-won" && d.stage !== "closed-lost");
  const openValue = open.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const weighted = open.reduce((sum, d) => sum + (Number(d.value) || 0) * ((d.probability || 0) / 100), 0);
  const wonValue = deals
    .filter((d) => d.stage === "closed-won")
    .reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const lostValue = deals
    .filter((d) => d.stage === "closed-lost")
    .reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const summary: Metric[] = [
    { label: "Open deals", value: open.length.toLocaleString(), note: open.length === deals.length ? "none closed yet" : `of ${deals.length} total` },
    { label: "Open value", value: money(openValue), note: "excludes won and lost" },
    // Weighted pipeline is the revenue-forecasting feature. Putting it on the
    // board unconditionally would have handed out a gated feature to every
    // plan, so the slot carries an ungated figure instead when it is not
    // included — and the Forecast button stays as the way to ask for it.
    features.revenueForecasting
      ? { label: "Weighted", value: money(weighted), note: "open value × each deal's probability" }
      : { label: "Closed lost", value: money(lostValue), note: `${deals.filter((d) => d.stage === "closed-lost").length} deals` },
    { label: "Closed won", value: money(wonValue), note: `${deals.filter((d) => d.stage === "closed-won").length} deals` },
  ];

  const getDealsByStage = (stageKey: string) => deals.filter((deal) => deal.stage === stageKey);
  const getTotalValue = (stageKey: string) => getDealsByStage(stageKey).reduce((sum, deal) => sum + (Number(deal.value) || 0), 0);

  const handleMoveDeal = async (dealId: string, newStage: string) => {
    try {
      const { error } = await supabase.from("deals").update({ stage: newStage }).eq("id", dealId);
      if (error) throw error;
      setDeals(deals.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
      toast({ title: "Deal moved", description: "Deal stage updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCustomPipelines = () => {
    if (!features.customPipelines) { triggerGate('customPipelines'); return; }
    toast({ title: "Custom Pipelines", description: "Create custom stages by contacting support for now. Full customization coming soon!" });
  };

  // Only an upsell now. The forecast itself is on the board, in the strip: it
  // used to be computed into a toast, which is a place numbers go to be
  // dismissed three seconds later and recomputed on the next click.
  const handleForecasting = () => triggerGate('revenueForecasting');

  if (planLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature || 'customPipelines'} currentPlan={currentPlan} />

      <PageHeader
        title="Pipeline"
        description="Track deals through your sales stages"
        actions={
          <>
            {!features.revenueForecasting && (
              <Button variant="outline" size="sm" onClick={handleForecasting}>
                <TrendingUp className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Forecast</span>
                <Sparkles className="w-3 h-3 ml-2 text-primary" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCustomPipelines}>
              <Settings className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Custom Pipeline</span>
              <span className="sm:hidden">Custom</span>
              {!features.customPipelines && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">New Deal</span><span className="sm:hidden">Add</span>
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <AddDealDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onDealAdded={loadDeals} />

        {!loading && deals.length === 0 ? (
          /* Shown instead of the board, not under it.
             Seven empty columns followed by "no deals yet" is the page telling
             you twice, and the second time from below the fold. */
          <Panel>
            <div className="px-5 py-10 text-center">
              <p className="text-[0.8125rem] font-medium text-foreground">No deals yet</p>
              <p className="mx-auto mt-1.5 max-w-md text-[0.6875rem] leading-relaxed text-muted-foreground">
                A deal is a lead you are actively working, with a value and a stage. Saved leads stay in
                Leads until you promote one here.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />Create the first one
              </Button>
            </div>
          </Panel>
        ) : (
          <>
            {/* The board's own totals, which it otherwise only showed per
                column — so the one question a pipeline exists to answer, what
                is it worth, took adding up seven headings. */}
            <MetricStrip metrics={summary} />

            <div className="pb-6 sm:overflow-x-auto">
              <div className="flex min-w-0 flex-col gap-4 sm:min-w-max sm:flex-row sm:gap-6">
                {stages.map((stage) => (
                  <PipelineColumn
                    key={stage.key}
                    title={stage.name}
                    deals={getDealsByStage(stage.key)}
                    totalValue={getTotalValue(stage.key)}
                    color={stage.color}
                    onMoveDeal={handleMoveDeal}
                    stages={stages}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Last, and quiet.
            It was a dashed tinted panel with an icon, sitting above the board
            — so the loudest thing on a page about your deals was an advert for
            a feature you do not have. */}
        {!features.automatedStageProgression && (
          <Panel flat className="bg-transparent">
            <div className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-medium text-foreground">Automated stage progression</p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  Deals move through stages on their own, from engagement signals.
                </p>
              </div>
              <Button className="shrink-0" variant="outline" size="sm" onClick={() => triggerGate('automatedStageProgression')}>
                Learn more
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;
