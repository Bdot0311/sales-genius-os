import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Coach from "./pages/Coach";
import Pipeline from "./pages/Pipeline";
import Outreach from "./pages/Outreach";
import Calendar from "./pages/Calendar";
import Analytics from "./pages/Analytics";
import Automations from "./pages/Automations";
import DashboardIntegrations from "./pages/DashboardIntegrations";
import PricingPage from "./pages/PricingPage";
import ApiDocs from "./pages/ApiDocs";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/leads" element={<Leads />} />
          <Route path="/dashboard/coach" element={<Coach />} />
          <Route path="/dashboard/pipeline" element={<Pipeline />} />
          <Route path="/dashboard/outreach" element={<Outreach />} />
          <Route path="/dashboard/calendar" element={<Calendar />} />
          <Route path="/dashboard/analytics" element={<Analytics />} />
          <Route path="/dashboard/automations" element={<Automations />} />
          <Route path="/dashboard/integrations" element={<DashboardIntegrations />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
