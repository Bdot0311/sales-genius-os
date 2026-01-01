import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import salesosLogo from "@/assets/salesos-logo.webp";
import {
  LayoutDashboard,
  Users,
  Mail,
  Calendar,
  TrendingUp,
  Mic,
  Workflow,
  BarChart3,
  LogOut,
  Menu,
  X,
  Puzzle,
  Settings,
  Shield,
  Clock,
  Search,
  Zap,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import { useSubscription } from "@/hooks/use-subscription";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useAdmin } from "@/hooks/use-admin";
import { useWhiteLabel } from "@/hooks/use-white-label";
import { useSearchCredits } from "@/hooks/use-search-credits";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { name: "Leads", icon: Users, href: "/dashboard/leads" },
  { name: "Pipeline", icon: TrendingUp, href: "/dashboard/pipeline" },
  { name: "Outreach", icon: Mail, href: "/dashboard/outreach" },
  { name: "Calendar", icon: Calendar, href: "/dashboard/calendar" },
  { name: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
  { name: "Coach", icon: Mic, href: "/dashboard/coach" },
  { name: "Automations", icon: Workflow, href: "/dashboard/automations" },
  { name: "Integrations", icon: Puzzle, href: "/integrations" },
  { name: "Settings", icon: Settings, href: "/settings" },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { subscription } = useSubscription();
  const { status: subscriptionStatus } = useSubscriptionStatus();
  const { isAdmin } = useAdmin();
  const { settings: whiteLabelSettings } = useWhiteLabel();
  const { credits } = useSearchCredits();

  // Calculate trial days remaining
  const trialDaysRemaining = subscriptionStatus?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(subscriptionStatus.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-2">
              {whiteLabelSettings?.logo_url ? (
                <img src={whiteLabelSettings.logo_url} alt={whiteLabelSettings.company_name || "Logo"} className="h-8" />
              ) : (
                <>
                  <img src={salesosLogo} alt="SalesOS Logo" className="w-8 h-8 rounded-lg" />
                  <span className="text-xl font-bold">{whiteLabelSettings?.company_name || "SalesOS"}</span>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.href);
                  setSidebarOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => {
                  navigate('/admin');
                  setSidebarOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Shield className="w-5 h-5" />
                <span>Admin Panel</span>
              </button>
            )}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3 px-4">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold">
                {user.email?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {subscription?.plan || 'Growth'} Plan
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-card border-b border-border flex items-center justify-between px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          
          <div className="flex items-center gap-4">
            {/* Search Credits Display */}
            {credits && (
              <TooltipProvider>
                <div className="flex items-center gap-3">
                  {/* Monthly Credits */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
                        <Search className="w-4 h-4 text-primary" />
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground leading-none">Credits</span>
                          <span className="text-sm font-semibold leading-tight">
                            {credits.remainingCredits.toLocaleString()}/{credits.totalCredits.toLocaleString()}
                          </span>
                        </div>
                        <Progress 
                          value={(credits.remainingCredits / credits.totalCredits) * 100} 
                          className="w-12 h-1.5"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{credits.remainingCredits.toLocaleString()} of {credits.totalCredits.toLocaleString()} monthly search credits remaining</p>
                      {credits.addonCredits > 0 && (
                        <p className="text-xs text-muted-foreground">Includes +{credits.addonCredits} add-on credits</p>
                      )}
                    </TooltipContent>
                  </Tooltip>

                  {/* Daily Limit */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
                        <Zap className="w-4 h-4 text-accent" />
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground leading-none">Today</span>
                          <span className="text-sm font-semibold leading-tight">
                            {credits.dailySearchesUsed}/{credits.dailySearchLimit}
                          </span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{credits.dailySearchLimit - credits.dailySearchesUsed} searches remaining today</p>
                      <p className="text-xs text-muted-foreground">Daily limit resets at midnight</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}

            {/* Trial days remaining badge */}
            {subscriptionStatus?.isTrialUser && trialDaysRemaining !== null && (
              <Badge 
                variant={trialDaysRemaining <= 3 ? "destructive" : "secondary"}
                className="flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                {trialDaysRemaining === 0 
                  ? "Trial expires today" 
                  : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left in trial`}
              </Badge>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
};
