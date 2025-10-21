import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PipelineColumn } from "@/components/dashboard/PipelineColumn";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Deal Pipeline</h1>
            <p className="text-muted-foreground">
              Manage your deals across all stages
            </p>
          </div>
          <Button variant="hero">
            <Plus className="w-4 h-4 mr-2" />
            New Deal
          </Button>
        </div>

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
            <Button variant="hero">
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
