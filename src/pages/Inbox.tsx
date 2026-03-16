import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox as InboxIcon } from "lucide-react";

const Inbox = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
            <p className="text-muted-foreground">Unified reply inbox for all your outreach</p>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <InboxIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No replies yet</h3>
            <p className="text-muted-foreground text-center">When leads reply to your outreach, their responses will appear here.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Inbox;
