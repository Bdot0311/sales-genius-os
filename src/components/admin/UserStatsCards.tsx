import { Card, CardContent } from "@/components/ui/card";
import { Users, Crown, Clock, Lock, TrendingUp, Shield } from "lucide-react";

interface Stats {
  total: number;
  admins: number;
  trials: number;
  locked: number;
  paid: number;
  free: number;
  conversionRate: number;
  planBreakdown: { free: number; starter: number; growth: number; pro: number };
}

export const UserStatsCards = ({ stats }: { stats: Stats }) => {
  const cards = [
    {
      label: "Total Users",
      value: stats.total,
      icon: Users,
      accent: "text-primary",
      bgAccent: "bg-primary/10",
    },
    {
      label: "Paid Users",
      value: stats.paid,
      icon: Crown,
      accent: "text-emerald-400",
      bgAccent: "bg-emerald-500/10",
    },
    {
      label: "Conversion Rate",
      value: `${stats.conversionRate}%`,
      icon: TrendingUp,
      accent: "text-blue-400",
      bgAccent: "bg-blue-500/10",
    },
    {
      label: "Active Trials",
      value: stats.trials,
      icon: Clock,
      accent: "text-amber-400",
      bgAccent: "bg-amber-500/10",
    },
    {
      label: "Locked",
      value: stats.locked,
      icon: Lock,
      accent: "text-destructive",
      bgAccent: "bg-destructive/10",
    },
    {
      label: "Admins",
      value: stats.admins,
      icon: Shield,
      accent: "text-primary",
      bgAccent: "bg-primary/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="border-border/50 bg-card/80 backdrop-blur-sm hover:border-border transition-colors"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {card.label}
              </span>
              <div className={`p-1.5 rounded-md ${card.bgAccent}`}>
                <card.icon className={`h-3.5 w-3.5 ${card.accent}`} />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
