import { useEffect } from "react";
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { useAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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

  if (adminLoading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AdminSidebar />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading admin panel...</p>
            </div>
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
      <div className="flex min-h-screen w-full bg-muted/30">
        <AdminSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2 flex-1">
              <Shield className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Admin Control Panel</h1>
              </div>
            </div>
          </header>

          {/* Main Content with Nested Routes */}
          <main className="flex-1 p-6 overflow-auto">
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
