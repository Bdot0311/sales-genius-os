import { useEffect } from "react";
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { useAdmin } from "@/hooks/use-admin";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Import admin sub-pages
import AdminUsers from "./admin/Users";
import AdminActivity from "./admin/Activity";
import AdminAnalytics from "./admin/Analytics";
import AdminSecurity from "./admin/Security";
import AdminSettings from "./admin/Settings";

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
              <Route path="users" element={<AdminUsers />} />
              <Route path="activity" element={<AdminActivity />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="security" element={<AdminSecurity />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
