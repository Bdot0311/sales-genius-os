import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Bot } from "lucide-react";

const Agent = () => (
  <DashboardLayout>
    <div className="flex items-center gap-3 mb-6">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Bot className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold">AI Sales Agent</h1>
        <p className="text-sm text-muted-foreground">Loading agent interface…</p>
      </div>
    </div>
    <div className="grid gap-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 rounded-lg bg-muted/30 animate-pulse" />
      ))}
    </div>
  </DashboardLayout>
);

export default Agent;
