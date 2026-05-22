import { Component, Suspense, lazy, useState, useEffect, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";

// Public marketing routes that should NOT trigger Supabase/auth/white-label loads
const PUBLIC_LANDING_PREFIXES = [
  "/", "/pricing", "/demo", "/api-docs", "/api-status", "/request-integration",
  "/privacy", "/terms", "/security", "/help", "/install", "/unsubscribe", "/blog",
  "/sales-operations-software", "/apollo-alternative",
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
const SalesOperationsSoftware = lazy(() => import("./pages/SalesOperationsSoftware"));
const ApolloAlternative = lazy(() => import("./pages/ApolloAlternative"));
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
const OnboardingStatus = lazy(() => import("./pages/OnboardingStatus"));

const queryClient = new QueryClient();

// Simple loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CHUNK_RELOAD_KEY = "__chunk_reload_attempt__";
const CHUNK_RELOAD_WINDOW_MS = 30_000;
const isChunkLoadError = (error: unknown) =>
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError/i.test(
    String(error instanceof Error ? error.message : error)
  );

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    if (!isChunkLoadError(error)) {
      console.error("App render error:", error, errorInfo);
      return;
    }

    try {
      const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - lastReload < CHUNK_RELOAD_WINDOW_MS) return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {}
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Refresh required</h1>
          <p className="text-muted-foreground">A new version is available. Refresh to continue.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Refresh
          </button>
        </div>
      </main>
    );
  }
}

/**
 * Deferred UI shell — loads Toasters and WhiteLabel side-effects AFTER the
 * first paint to reduce Total Blocking Time on the landing page.
 *
 * IMPORTANT: children are ALWAYS rendered at the same structural position
 * (direct children of the fragment). Previously the shell wrapped children in
 * a TooltipProvider, which caused React to unmount + remount the entire tree
 * ~100 ms after mount — producing the visible "auto-refresh" glitch.
 * Toasters render as portals appended to document.body, so they work fine as
 * siblings. Each component that needs tooltip context already carries its own
 * local <TooltipProvider>.
 */
const DeferredUIShell = ({ children }: { children: ReactNode }) => {
  const [SideEffects, setSideEffects] = useState<ComponentType | null>(null);

  useEffect(() => {
    const isPublic = isPublicLandingPath(window.location.pathname);

    const load = () => {
      const imports: Promise<any>[] = [
        import("@/components/ui/toaster"),
        import("@/components/ui/sonner"),
      ];
      if (!isPublic) {
        imports.push(import("@/hooks/use-white-label"));
      }

      Promise.all(imports).then((mods) => {
        const Toaster = mods[0].Toaster;
        const SonnerToaster = mods[1].Toaster;
        const useWhiteLabel = !isPublic ? mods[2]?.useWhiteLabel : null;

        // Stable component rendered once — provides toasts + white-label CSS vars.
        // Never wraps children so the children tree is never remounted.
        const Providers = () => {
          if (useWhiteLabel) {
            try { useWhiteLabel(); } catch (e) { console.error("WhiteLabel init error:", e); }
          }
          return <><Toaster /><SonnerToaster /></>;
        };

        setSideEffects(() => Providers);
      });
    };

    const delay = isPublic ? 1500 : 100;
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(load, { timeout: isPublic ? 4000 : 2000 });
    } else {
      setTimeout(load, delay);
    }
  }, []);

  // Children are always at the same tree level — no structural change ever.
  return (
    <>
      {children}
      {SideEffects && <SideEffects />}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DeferredUIShell>
      <BrowserRouter>
        <ChunkErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/sales-operations-software" element={<SalesOperationsSoftware />} />
              <Route path="/apollo-alternative" element={<ApolloAlternative />} />
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
              <Route path="/onboarding-status" element={<OnboardingStatus />} />
              <Route path="/dashboard/onboarding-status" element={<OnboardingStatus />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/client-portal/:token" element={<ClientPortal />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ChunkErrorBoundary>
      </BrowserRouter>
    </DeferredUIShell>
  </QueryClientProvider>
);

export default App;
