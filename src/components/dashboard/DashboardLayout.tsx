import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  Inbox,
  Target,
  ShieldCheck,
  Bot,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import { useSubscription } from "@/hooks/use-subscription";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useAdmin } from "@/hooks/use-admin";
import { useWhiteLabel } from "@/hooks/use-white-label";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { useLiveCrmIndicators } from "@/hooks/use-live-crm-indicators";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navSections = [
  {
    label: "WORKSPACE",
    items: [
      { name: "Overview", icon: LayoutDashboard, href: "/dashboard" },
      { name: "Inbox", icon: Inbox, href: "/dashboard/inbox" },
      { name: "Leads", icon: Users, href: "/dashboard/leads" },
      { name: "ICP Builder", icon: Target, href: "/dashboard/icp" },
      { name: "Pipeline", icon: TrendingUp, href: "/dashboard/pipeline" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { name: "AI Agent", icon: Bot, href: "/dashboard/agent" },
      { name: "Outreach", icon: Mail, href: "/dashboard/outreach" },
      { name: "Calendar", icon: Calendar, href: "/dashboard/calendar" },
      { name: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
      { name: "Coach", icon: Mic, href: "/dashboard/coach" },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { name: "Deliverability", icon: ShieldCheck, href: "/dashboard/deliverability" },
      { name: "Automations", icon: Workflow, href: "/dashboard/automations" },
      { name: "Integrations", icon: Puzzle, href: "/integrations" },
      { name: "Settings", icon: Settings, href: "/settings" },
    ],
  },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { subscription } = useSubscription();
  const { status: subscriptionStatus } = useSubscriptionStatus();
  const { isAdmin } = useAdmin();
  const { settings: whiteLabelSettings } = useWhiteLabel();
  const { credits } = useSearchCredits();
  useLiveCrmIndicators();


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

  // Locked-account block: prevent any dashboard access for non-admin locked users
  if (subscription?.accountStatus === 'locked' && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-destructive/30 rounded-lg p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Account Locked</h1>
          <p className="text-muted-foreground">
            Your account has been suspended. This usually happens after a failed payment or expired trial.
            Please update your billing or contact support to restore access.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => navigate('/pricing')}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-md py-2 px-4 text-sm font-medium"
            >
              View Plans
            </button>
            <button
              onClick={handleSignOut}
              className="w-full border border-border hover:bg-muted rounded-md py-2 px-4 text-sm font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
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
        className={`fixed z-50 bg-[hsl(224,13%,7%)] border-r border-border/60 transition-all duration-300 ${
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
                  <img src={salesosLogo} alt="OutReign Logo" className="w-8 h-8 rounded-lg flex-shrink-0" />
                  {!sidebarCollapsed && (
                    whiteLabelSettings?.company_name
                      ? <span className="text-xl font-semibold">{whiteLabelSettings.company_name}</span>
                      : <span className="text-xl font-semibold">
                          <span className="text-foreground">Out</span><span className="text-primary">Reign</span>
                        </span>
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
          <nav className={`flex-1 ${sidebarCollapsed ? "p-2" : "px-3 py-3"} overflow-y-auto`}>
            {navSections.map((section) => (
              <div key={section.label} className="mb-1">
                {!sidebarCollapsed && (
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase select-none">
                    {section.label}
                  </p>
                )}
                {section.items.map((item) => {
                  const isActive = location.pathname === item.href ||
                    (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
                  return (
                    <TooltipProvider key={item.name} delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => { navigate(item.href); setSidebarOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                              sidebarCollapsed ? "justify-center" : ""
                            } ${
                              isActive
                                ? "bg-accent text-foreground font-medium border-l-2 border-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border-l-2 border-transparent"
                            }`}
                            style={isActive && !sidebarCollapsed ? { paddingLeft: '10px' } : undefined}
                          >
                            <item.icon className="w-4 h-4 flex-shrink-0" />
                            {!sidebarCollapsed && <span>{item.name}</span>}
                          </button>
                        </TooltipTrigger>
                        {sidebarCollapsed && (
                          <TooltipContent side="right"><p>{item.name}</p></TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
            {isAdmin && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { navigate('/admin'); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50 ${sidebarCollapsed ? "justify-center" : ""}`}
                    >
                      <Shield className="w-4 h-4 flex-shrink-0" />
                      {!sidebarCollapsed && <span>Admin Panel</span>}
                    </button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right"><p>Admin Panel</p></TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </nav>

          {/* User section - fixed at bottom */}
          {sidebarCollapsed ? (
            <div className="flex-shrink-0 p-2 border-t border-border/60 flex flex-col items-center gap-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-semibold cursor-default">
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
                    <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-6 w-6 text-muted-foreground hover:text-foreground">
                      <LogOut className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right"><p>Sign Out</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <div className="flex-shrink-0 border-t border-border/60 p-3">
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                  {user.email?.[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{user.email}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{subscription?.plan || 'Growth'} Plan</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground">
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={`min-w-0 overflow-x-hidden transition-all duration-300 ${sidebarCollapsed ? "lg:ml-[4.5rem]" : "lg:ml-64"}`}>
        {/* Top bar */}
        <header className="dashboard-topbar h-12 sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border/60 flex items-center px-[var(--mobile-page-gutter)] sm:px-6 gap-1">
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
          
          <div className="flex min-w-0 flex-shrink items-center gap-1 overflow-x-auto sm:gap-3">
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
        <main className="dashboard-page-gutters min-w-0 overflow-x-hidden px-4 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</main>
      </div>
    </div>
  );
};
