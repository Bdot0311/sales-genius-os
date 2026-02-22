import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PipelineColumn } from "@/components/dashboard/PipelineColumn";
import { AddDealDialog } from "@/components/dashboard/AddDealDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Sparkles, Settings, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { FeatureHighlight } from "@/components/dashboard/FeatureHighlight";

interface Deal {
  id: string;
  title: string;
  company_name: string;
  value: number;
  probability: number;
  stage: string;
}

const stages = [
  { name: "New", key: "new", color: "bg-blue-500" },
  { name: "Contacted", key: "contacted", color: "bg-purple-500" },
  { name: "Qualified", key: "qualified", color: "bg-green-500" },
  { name: "Proposal", key: "proposal", color: "bg-yellow-500" },
  { name: "Negotiation", key: "negotiation", color: "bg-orange-500" },
  { name: "Closed Won", key: "closed-won", color: "bg-emerald-500" },
  { name: "Closed Lost", key: "closed-lost", color: "bg-red-500" },
];

const Pipeline = () => {
  const { toast } = useToast();
  const { 
    currentPlan, 
    features, 
    loading: planLoading,
    gateModalOpen,
    setGateModalOpen,
    gatedFeature,
    triggerGate,
  } = usePlanFeatures();
  
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  useEffect(() => {
    loadDeals();
  }, []);

  const loadDeals = async () => {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setDeals(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading deals",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDealsByStage = (stageKey: string) => {
    return deals.filter((deal) => deal.stage === stageKey);
  };

  const getTotalValue = (stageKey: string) => {
    return getDealsByStage(stageKey).reduce(
      (sum, deal) => sum + (Number(deal.value) || 0),
      0
    );
  };

  const handleMoveDealt = async (dealId: string, newStage: string) => {
    try {
      const { error } = await supabase
        .from("deals")
        .update({ stage: newStage })
        .eq("id", dealId);

      if (error) throw error;

      setDeals(deals.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
      
      toast({
        title: "Deal moved",
        description: "Deal stage updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCustomPipelines = () => {
    if (!features.customPipelines) {
      triggerGate('customPipelines');
      return;
    }
    toast({
      title: "Custom Pipelines",
      description: "Create custom stages by contacting support for now. Full customization coming soon!",
    });
  };

  const handleForecasting = () => {
    if (!features.revenueForecasting) {
      triggerGate('revenueForecasting');
      return;
    }
    
    // Calculate weighted forecast based on probability
    const weightedValue = deals.reduce((sum, deal) => {
      return sum + (Number(deal.value) || 0) * ((deal.probability || 0) / 100);
    }, 0);
    
    const closedWonValue = deals
      .filter(d => d.stage === 'closed-won')
      .reduce((sum, deal) => sum + (Number(deal.value) || 0), 0);
    
    toast({
      title: "Revenue Forecast",
      description: `Weighted Pipeline: $${Math.round(weightedValue).toLocaleString()} | Closed Won: $${closedWonValue.toLocaleString()}`,
    });
  };

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
      <FeatureGateModal 
        open={gateModalOpen} 
        onOpenChange={setGateModalOpen}
        feature={gatedFeature || 'customPipelines'}
        currentPlan={currentPlan}
      />
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Deal Pipeline</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Manage your deals across all stages
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleForecasting}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Forecast
              {!features.revenueForecasting && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCustomPipelines}>
              <Settings className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Custom Pipeline</span>
              <span className="sm:hidden">Custom</span>
              {!features.customPipelines && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            <Button variant="hero" size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Deal
            </Button>
          </div>
        </div>

        {/* Auto-progression hint */}
        {!features.automatedStageProgression && (
          <Card className="p-4 border-dashed border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Automated Stage Progression</p>
                  <p className="text-sm text-muted-foreground">Let deals move through stages automatically based on engagement signals.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => triggerGate('automatedStageProgression')}>
                Learn More
              </Button>
            </div>
          </Card>
        )}

        <AddDealDialog 
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onDealAdded={loadDeals}
        />

        {/* Pipeline */}
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-6 min-w-max">
            {stages.map((stage) => (
              <PipelineColumn
                key={stage.key}
                title={stage.name}
                deals={getDealsByStage(stage.key)}
                totalValue={getTotalValue(stage.key)}
                color={stage.color}
                onMoveDeal={handleMoveDealt}
                stages={stages}
              />
            ))}
          </div>
        </div>

        {loading && (
          <div className="text-center py-12 text-muted-foreground">
            Loading deals...
          </div>
        )}

        {!loading && deals.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              No deals yet. Create your first deal to get started.
            </p>
            <Button variant="hero" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Deal
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;
