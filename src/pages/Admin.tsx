import { useEffect } from "react";
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { useAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FluidFieldBackground } from "@/components/ui/fluid-field";

// Import admin sub-pages / grouped pages
import AdminSecurity from "./admin/Security";
import AdminBilling from "./admin/Billing";
import UsersGroup from "./admin/groups/UsersGroup";
import GrowthGroup from "./admin/groups/GrowthGroup";
import HealthGroup from "./admin/groups/HealthGroup";
import SettingsGroup from "./admin/groups/SettingsGroup";

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [isAdmin, adminLoading, navigate]);

  // Dialogs, sheets and menus render outside the shell; this lets them share the design.
  useEffect(() => {
    document.body.classList.add("dashboard-active");
    return () => document.body.classList.remove("dashboard-active");
  }, []);

  if (adminLoading) {
    return (
      <SidebarProvider>
        <div className="dashboard-shell admin-shell flex min-h-screen w-full bg-background">
          <AdminSidebar />
          <div className="flex flex-1 items-center justify-center">
            {/* A 48px ring spinning over a sentence is a page-sized way to say
                "one moment". */}
            <p className="text-[0.6875rem] text-muted-foreground">Checking your access…</p>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <SidebarProvider>
      {/* One ground. The shell tinted the content area and left the header
          strip on the page background, so the panel looked like two documents
          stacked, neither of them the colour the rest of the product uses. */}
      <div className="dashboard-shell admin-shell flex min-h-screen w-full bg-background">
        <FluidFieldBackground />
        <AdminSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="dashboard-topbar sticky top-0 z-10 flex h-16 items-center gap-3 px-4 sm:px-7">
            <SidebarTrigger />
            {/* No shield icon: the sidebar it sits beside is already labelled
                Admin, and a 24px primary badge for a heading is the loudest
                mark on a page whose content is numbers. */}
            <h1 className="text-[0.8125rem] font-medium text-foreground">Admin</h1>
            <div className="ml-auto"><ThemeToggle /></div>
          </header>

          <main className="admin-page-content min-w-0 flex-1 p-4 sm:p-7">
            <Routes>
              <Route index element={<AdminDashboard />} />
              {/* Grouped pages */}
              <Route path="users" element={<UsersGroup />} />
              <Route path="growth" element={<GrowthGroup />} />
              <Route path="health" element={<HealthGroup />} />
              <Route path="settings" element={<SettingsGroup />} />
              <Route path="security" element={<AdminSecurity />} />
              <Route path="billing" element={<AdminBilling />} />

              {/* Legacy paths -> grouped tabs */}
              <Route path="activation" element={<Navigate to="/admin/users?tab=activation" replace />} />
              <Route path="signup-logs" element={<Navigate to="/admin/users?tab=signup-logs" replace />} />
              <Route path="campaign-setup" element={<Navigate to="/admin/users?tab=campaign-setup" replace />} />
              <Route path="analytics" element={<Navigate to="/admin/growth?tab=analytics" replace />} />
              <Route path="traffic" element={<Navigate to="/admin/growth?tab=traffic" replace />} />
              <Route path="re-engagement" element={<Navigate to="/admin/growth?tab=re-engagement" replace />} />
              <Route path="realtime" element={<Navigate to="/admin/health?tab=realtime" replace />} />
              <Route path="activity" element={<Navigate to="/admin/health?tab=activity" replace />} />
              <Route path="alerts" element={<Navigate to="/admin/health?tab=alerts" replace />} />
              <Route path="webhooks" element={<Navigate to="/admin/settings?tab=webhooks" replace />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
