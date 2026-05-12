import { Suspense, lazy, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";

// Public marketing routes that should NOT trigger Supabase/auth/white-label loads
const PUBLIC_LANDING_PREFIXES = [
  "/", "/pricing", "/demo", "/api-docs", "/api-status", "/request-integration",
  "/privacy", "/terms", "/security", "/help", "/install", "/unsubscribe", "/blog",
];
const isPublicLandingPath = (pathname: string) => {
  if (pathname === "/") return true;
  return PUBLIC_LANDING_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")),
  );
};

// Lazy load non-critical pages
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const SavedLeads = lazy(() => import("./pages/SavedLeads"));
const Coach = lazy(() => import("./pages/Coach"));
const LiveCoaching = lazy(() => import("./pages/LiveCoaching"));
const Playbooks = lazy(() => import("./pages/Playbooks"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Outreach = lazy(() => import("./pages/Outreach"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Automations = lazy(() => import("./pages/Automations"));
const SequenceDetail = lazy(() => import("./pages/SequenceDetail"));
const DashboardIntegrations = lazy(() => import("./pages/DashboardIntegrations"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const DemoPage = lazy(() => import("./pages/DemoPage"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const ApiStatus = lazy(() => import("./pages/ApiStatus"));
const RequestIntegration = lazy(() => import("./pages/RequestIntegration"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Security = lazy(() => import("./pages/Security"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const Install = lazy(() => import("./pages/Install"));
const Checkout = lazy(() => import("./pages/Checkout"));
const ICP = lazy(() => import("./pages/ICP"));
const Inbox = lazy(() => import("./pages/Inbox"));
const Deliverability = lazy(() => import("./pages/Deliverability"));
const Sequences = lazy(() => import("./pages/Sequences"));
const MessageBlocks = lazy(() => import("./pages/MessageBlocks"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Simple loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Deferred UI shell — loads TooltipProvider, Toasters, and WhiteLabelProvider
 * AFTER the first paint to reduce Total Blocking Time on the landing page.
 */
const DeferredUIShell = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [Shell, setShell] = useState<React.ComponentType<{ children: React.ReactNode }> | null>(null);

  useEffect(() => {
    // Skip the heavy shell entirely on public marketing pages — no auth, no
    // toasts, no white-label needed, so we avoid loading the Supabase client
    // (~154KB) on first paint for landing visitors.
    const isPublic = isPublicLandingPath(window.location.pathname);

    const load = () => {
      const baseImports: Promise<any>[] = [
        import("@/components/ui/tooltip"),
        import("@/components/ui/toaster"),
        import("@/components/ui/sonner"),
      ];
      if (!isPublic) {
        baseImports.push(import("@/hooks/use-white-label"));
      }

      Promise.all(baseImports).then((mods) => {
        const TooltipProvider = mods[0].TooltipProvider;
        const Toaster = mods[1].Toaster;
        const SonnerToaster = mods[2].Toaster;
        const useWhiteLabel = !isPublic ? mods[3].useWhiteLabel : null;

        const CombinedShell = ({ children }: { children: React.ReactNode }) => {
          if (useWhiteLabel) {
            try { useWhiteLabel(); } catch (e) { console.error("WhiteLabel init error:", e); }
          }
          return (
            <TooltipProvider>
              <Toaster />
              <SonnerToaster />
              {children}
            </TooltipProvider>
          );
        };

        setShell(() => CombinedShell);
        setReady(true);
      });
    };

    // On public pages we delay even longer — first paint is the priority.
    const delay = isPublic ? 1500 : 100;
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(load, { timeout: isPublic ? 4000 : 2000 });
    } else {
      setTimeout(load, delay);
    }
  }, []);

  if (!ready || !Shell) {
    return <>{children}</>;
  }

  return <Shell>{children}</Shell>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DeferredUIShell>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/api-docs" element={<ApiDocs />} />
            <Route path="/api-status" element={<ApiStatus />} />
            <Route path="/request-integration" element={<RequestIntegration />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/security" element={<Security />} />
            <Route path="/confirmation" element={<Confirmation />} />
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/help/category/:category" element={<HelpCenter />} />
            <Route path="/help/article/:slug" element={<HelpCenter />} />
            <Route path="/install" element={<Install />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/leads" element={<Leads />} />
            <Route path="/dashboard/leads/saved" element={<SavedLeads />} />
            <Route path="/dashboard/coach" element={<Coach />} />
            <Route path="/dashboard/coach/live" element={<LiveCoaching />} />
            <Route path="/dashboard/coach/playbooks" element={<Playbooks />} />
            <Route path="/dashboard/pipeline" element={<Pipeline />} />
            <Route path="/dashboard/outreach" element={<Outreach />} />
            <Route path="/dashboard/calendar" element={<Calendar />} />
            <Route path="/dashboard/analytics" element={<Analytics />} />
            <Route path="/dashboard/automations" element={<Automations />} />
            <Route path="/dashboard/sequences/:id" element={<SequenceDetail />} />
            <Route path="/dashboard/sequences" element={<Sequences />} />
            <Route path="/dashboard/message-blocks" element={<MessageBlocks />} />
            <Route path="/dashboard/icp" element={<ICP />} />
            <Route path="/dashboard/inbox" element={<Inbox />} />
            <Route path="/dashboard/deliverability" element={<Deliverability />} />
            <Route path="/integrations" element={<DashboardIntegrations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin/*" element={<Admin />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/client-portal/:token" element={<ClientPortal />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DeferredUIShell>
  </QueryClientProvider>
);

export default App;
