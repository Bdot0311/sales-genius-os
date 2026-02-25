import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import salesosLogo from "@/assets/salesos-logo-64.webp";
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
  PanelLeftClose,
  PanelLeft,
  Puzzle,
  Settings,
  Shield,
  Clock,
  Search,
  Zap,
  HelpCircle,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import { useSubscription } from "@/hooks/use-subscription";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useAdmin } from "@/hooks/use-admin";
import { useWhiteLabel } from "@/hooks/use-white-label";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { Download } from "lucide-react";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
        className={`fixed z-50 bg-card border-r border-border transition-all duration-300 ${
          sidebarCollapsed ? "w-[4.5rem]" : "w-64"
        } ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        style={{
          top: 'env(safe-area-inset-top, 0px)',
          left: 0,
          height: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo */}
          <div className={`flex items-center justify-between ${sidebarCollapsed ? "p-3" : "p-6"} border-b border-border`}>
            <div className="flex items-center gap-2">
              {whiteLabelSettings?.logo_url ? (
                <img src={whiteLabelSettings.logo_url} alt={whiteLabelSettings.company_name || "Logo"} className="h-8" />
              ) : (
                <>
                  <img src={salesosLogo} alt="SalesOS Logo" className="w-8 h-8 rounded-lg flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="text-xl font-bold">{whiteLabelSettings?.company_name || "SalesOS"}</span>
                  )}
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
          <nav className={`flex-1 ${sidebarCollapsed ? "p-2" : "p-4"} space-y-1 overflow-y-auto`}>
            {navigation.map((item) => (
              <TooltipProvider key={item.name} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        navigate(item.href);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 ${sidebarCollapsed ? "justify-center px-2" : "px-4"} py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors`}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && <span>{item.name}</span>}
                    </button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right">
                      <p>{item.name}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ))}
            {isAdmin && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        navigate('/admin');
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 ${sidebarCollapsed ? "justify-center px-2" : "px-4"} py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors`}
                    >
                      <Shield className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && <span>Admin Panel</span>}
                    </button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right">
                      <p>Admin Panel</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </nav>

          {/* Help & Install prompts */}
          {!sidebarCollapsed ? (
            <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-muted/30 space-y-2">
              <a 
                href="/help" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <HelpCircle className="w-4 h-4 flex-shrink-0" />
                <span>Need help? Visit our Help Center</span>
              </a>
              <button
                onClick={() => { navigate('/install'); setSidebarOpen(false); }}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors w-full"
              >
                <Download className="w-4 h-4 flex-shrink-0" />
                <span>Install App</span>
              </button>
            </div>
          ) : (
            <div className="flex-shrink-0 px-2 py-3 border-t border-border bg-muted/30 flex flex-col items-center gap-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href="/help" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle className="w-4 h-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right"><p>Help Center</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => { navigate('/install'); setSidebarOpen(false); }} className="text-muted-foreground hover:text-primary transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right"><p>Install App</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Collapse toggle - desktop only */}
          <div className="hidden lg:flex flex-shrink-0 justify-center py-2 border-t border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
          </div>

          {/* User section - fixed at bottom */}
          <div className={`flex-shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"} border-t border-border bg-card`}>
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold cursor-default">
                        {user.email?.[0].toUpperCase()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{user.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{subscription?.plan || 'Growth'} Plan</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-8 w-8">
                        <LogOut className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right"><p>Sign Out</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "lg:ml-[4.5rem]" : "lg:ml-64"}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 min-h-[3rem] bg-card border-b border-border flex items-center px-2 sm:px-6 py-1.5 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-8 w-8"
            onClick={() => {
              // On mobile: toggle drawer. On desktop: toggle collapse.
              if (window.innerWidth < 1024) {
                setSidebarOpen(true);
              } else {
                setSidebarCollapsed(!sidebarCollapsed);
              }
            }}
          >
            {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
          <div className="flex-1 min-w-0" />
          
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0 overflow-x-auto max-w-[calc(100%-3rem)]">
            {/* Admin Badge - icon only on mobile */}
            {isAdmin && (
              <Badge variant="default" className="flex items-center gap-1 bg-primary text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 flex-shrink-0">
                <Shield className="w-3 h-3" />
                <span className="hidden sm:inline">Admin</span>
              </Badge>
            )}

            {/* Search Credits Display - Show unlimited for admins */}
            {isAdmin ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-primary/10 border border-primary/20 flex-shrink-0">
                      <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                      <span className="text-[10px] sm:text-sm font-semibold">∞</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Admin accounts have unlimited search credits</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : credits && (
              <TooltipProvider>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Monthly Credits */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-muted/50 border border-border">
                        <Search className="w-3 h-3 text-primary flex-shrink-0" />
                        <span className="text-[10px] sm:text-sm font-semibold leading-tight whitespace-nowrap">
                          {credits.remainingCredits.toLocaleString()}/{credits.totalCredits.toLocaleString()}
                        </span>
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
                      <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md bg-muted/50 border border-border">
                        <Zap className="w-3 h-3 text-accent flex-shrink-0" />
                        <span className="text-[10px] sm:text-sm font-semibold leading-tight whitespace-nowrap">
                          {credits.dailySearchesUsed}/{credits.dailySearchLimit}
                        </span>
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
            {!isAdmin && subscriptionStatus?.isTrialUser && trialDaysRemaining !== null && (
              <Badge 
                variant={trialDaysRemaining <= 3 ? "destructive" : "secondary"}
                className="flex items-center gap-0.5 text-[10px] sm:text-xs px-1.5 py-0.5 flex-shrink-0"
              >
                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span className="hidden sm:inline">
                  {trialDaysRemaining === 0 
                    ? "Trial expires today" 
                    : `${trialDaysRemaining}d left`}
                </span>
                <span className="sm:hidden">
                  {trialDaysRemaining}d
                </span>
              </Badge>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
};
