import { Component, Suspense, lazy, useState, useEffect, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";

// Public marketing routes that should NOT trigger Supabase/auth/white-label loads
const PUBLIC_LANDING_PREFIXES = [
  "/", "/pricing", "/demo", "/api-docs", "/api-status", "/request-integration",
  "/privacy", "/terms", "/security", "/help", "/install", "/unsubscribe", "/blog",
  "/sales-operations-software", "/apollo-alternative", "/guides",
  "/vs-apollo", "/vs-instantly", "/partners",
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
const VsApollo = lazy(() => import("./pages/VsApollo"));
const VsInstantly = lazy(() => import("./pages/VsInstantly"));
const Partners = lazy(() => import("./pages/Partners"));
const EmailWarmupGuide = lazy(() => import("./pages/EmailWarmupGuide"));
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
const Agent = lazy(() => import("./pages/Agent"));

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
      const toasterPromise = import("@/components/ui/toaster");
      const sonnerPromise = import("@/components/ui/sonner");
      const whiteLabelPromise = !isPublic
        ? import("@/hooks/use-white-label")
        : Promise.resolve(null);

      Promise.all([toasterPromise, sonnerPromise, whiteLabelPromise])
        .then(([toasterMod, sonnerMod, whiteLabelMod]) => {
          const Toaster = toasterMod?.Toaster;
          const SonnerToaster = sonnerMod?.Toaster;
          const useWhiteLabel = whiteLabelMod?.useWhiteLabel ?? null;

          if (!Toaster || !SonnerToaster) {
            console.error("DeferredUIShell: missing Toaster export", {
              hasToaster: !!Toaster,
              hasSonner: !!SonnerToaster,
            });
            return;
          }

          // Stable component rendered once — provides toasts + white-label CSS vars.
          // Never wraps children so the children tree is never remounted.
          const Providers = () => {
            if (useWhiteLabel) {
              try { useWhiteLabel(); } catch (e) { console.error("WhiteLabel init error:", e); }
            }
            return <><Toaster /><SonnerToaster /></>;
          };

          setSideEffects(() => Providers);
        })
        .catch((err) => {
          console.error("DeferredUIShell: failed to load UI shell", err);
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

const MaintenancePage = ({ message }: { message: string }) => {
  const handleAdminSignIn = async () => {
    // Sign out any current session so the admin gets a clean login
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l5.654-4.654m5.292-5.292l4.654-5.654a2.548 2.548 0 013.586 3.586l-5.653 4.655M16.124 6.88l-4.655 5.653" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Under Maintenance</h1>
        <p className="text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground/60">
          Admin?{" "}
          <button
            type="button"
            onClick={handleAdminSignIn}
            className="underline hover:text-muted-foreground cursor-pointer"
          >
            Sign in here.
          </button>
        </p>
      </div>
    </div>
  );
};

// Wraps app-only routes (dashboard, settings, etc.) — not landing or admin.
// Reads maintenance status via a security-definer RPC so any user can query it.
// Fails open: if the RPC doesn't exist yet (migration not run), lets users through.
const MaintenanceGuard = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<{ loading: boolean; active: boolean; message: string; isAdmin: boolean }>({
    loading: true, active: false, message: "We're performing scheduled maintenance. We'll be back shortly.", isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Get the current authenticated user first so we check THEIR role
        const { data: { user } } = await supabase.auth.getUser();

        const [{ data: active }, { data: msg }, { data: roles }] = await Promise.all([
          supabase.rpc('get_maintenance_status'),
          supabase.rpc('get_maintenance_message'),
          user
            ? supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').limit(1)
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const isAdmin = !!(roles?.length);
        setState({
          loading: false,
          active: active === true,
          message: typeof msg === 'string' ? msg.replace(/^"|"$/g, '') : "We're performing scheduled maintenance.",
          isAdmin,
        });
      } catch {
        // Migration not run yet or network error — fail open (don't block users)
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) return <PageLoader />;
  if (state.active && !state.isAdmin) return <MaintenancePage message={state.message} />;
  return <>{children}</>;
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
              <Route path="/vs-apollo" element={<VsApollo />} />
              <Route path="/vs-instantly" element={<VsInstantly />} />
              <Route path="/partners" element={<Partners />} />
              <Route path="/guides/email-warmup" element={<EmailWarmupGuide />} />
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
              <Route path="/dashboard" element={<MaintenanceGuard><Dashboard /></MaintenanceGuard>} />
              <Route path="/dashboard/leads" element={<MaintenanceGuard><Leads /></MaintenanceGuard>} />
              <Route path="/dashboard/leads/saved" element={<MaintenanceGuard><SavedLeads /></MaintenanceGuard>} />
              <Route path="/dashboard/coach" element={<MaintenanceGuard><Coach /></MaintenanceGuard>} />
              <Route path="/dashboard/coach/live" element={<MaintenanceGuard><LiveCoaching /></MaintenanceGuard>} />
              <Route path="/dashboard/coach/playbooks" element={<MaintenanceGuard><Playbooks /></MaintenanceGuard>} />
              <Route path="/dashboard/pipeline" element={<MaintenanceGuard><Pipeline /></MaintenanceGuard>} />
              <Route path="/dashboard/outreach" element={<MaintenanceGuard><Outreach /></MaintenanceGuard>} />
              <Route path="/dashboard/calendar" element={<MaintenanceGuard><Calendar /></MaintenanceGuard>} />
              <Route path="/dashboard/analytics" element={<MaintenanceGuard><Analytics /></MaintenanceGuard>} />
              <Route path="/dashboard/automations" element={<MaintenanceGuard><Automations /></MaintenanceGuard>} />
              <Route path="/dashboard/sequences/:id" element={<MaintenanceGuard><SequenceDetail /></MaintenanceGuard>} />
              <Route path="/dashboard/sequences" element={<MaintenanceGuard><Sequences /></MaintenanceGuard>} />
              <Route path="/dashboard/message-blocks" element={<MaintenanceGuard><MessageBlocks /></MaintenanceGuard>} />
              <Route path="/dashboard/icp" element={<MaintenanceGuard><ICP /></MaintenanceGuard>} />
              <Route path="/dashboard/inbox" element={<MaintenanceGuard><Inbox /></MaintenanceGuard>} />
              <Route path="/dashboard/deliverability" element={<MaintenanceGuard><Deliverability /></MaintenanceGuard>} />
              <Route path="/integrations" element={<MaintenanceGuard><DashboardIntegrations /></MaintenanceGuard>} />
              <Route path="/settings" element={<MaintenanceGuard><Settings /></MaintenanceGuard>} />
              <Route path="/onboarding-status" element={<MaintenanceGuard><OnboardingStatus /></MaintenanceGuard>} />
              <Route path="/dashboard/onboarding-status" element={<MaintenanceGuard><OnboardingStatus /></MaintenanceGuard>} />
              <Route path="/dashboard/agent" element={<MaintenanceGuard><Agent /></MaintenanceGuard>} />
              <Route path="/admin/*" element={<MaintenanceGuard><Admin /></MaintenanceGuard>} />
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
