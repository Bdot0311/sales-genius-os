import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import { useWhiteLabel } from "./hooks/use-white-label";

// Lazy load non-critical pages
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const SavedLeads = lazy(() => import("./pages/SavedLeads"));
const Coach = lazy(() => import("./pages/Coach"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Outreach = lazy(() => import("./pages/Outreach"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Automations = lazy(() => import("./pages/Automations"));
const DashboardIntegrations = lazy(() => import("./pages/DashboardIntegrations"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const ApiStatus = lazy(() => import("./pages/ApiStatus"));
const RequestIntegration = lazy(() => import("./pages/RequestIntegration"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Security = lazy(() => import("./pages/Security"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Simple loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Component that applies white label settings
const WhiteLabelProvider = ({ children }: { children: React.ReactNode }) => {
  useWhiteLabel();
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WhiteLabelProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/api-docs" element={<ApiDocs />} />
              <Route path="/api-status" element={<ApiStatus />} />
              <Route path="/request-integration" element={<RequestIntegration />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/security" element={<Security />} />
              <Route path="/confirmation" element={<Confirmation />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/leads" element={<Leads />} />
              <Route path="/dashboard/leads/saved" element={<SavedLeads />} />
              <Route path="/dashboard/coach" element={<Coach />} />
              <Route path="/dashboard/pipeline" element={<Pipeline />} />
              <Route path="/dashboard/outreach" element={<Outreach />} />
              <Route path="/dashboard/calendar" element={<Calendar />} />
              <Route path="/dashboard/analytics" element={<Analytics />} />
              <Route path="/dashboard/automations" element={<Automations />} />
              <Route path="/integrations" element={<DashboardIntegrations />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin/*" element={<Admin />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </WhiteLabelProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
