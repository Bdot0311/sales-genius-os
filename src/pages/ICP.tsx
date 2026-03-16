import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Target } from "lucide-react";

const ICP = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Ideal Customer Profiles</h1>
            <p className="text-muted-foreground">Define and manage your target customer profiles</p>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Coming soon</h3>
            <p className="text-muted-foreground text-center">ICP Builder is being set up. Full functionality coming shortly.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ICP;
