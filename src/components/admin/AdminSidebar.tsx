import { LayoutDashboard, Users, Settings, Lock, ArrowLeft, TrendingUp, CreditCard, HeartPulse } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Growth", url: "/admin/growth", icon: TrendingUp },
  { title: "Health", url: "/admin/health", icon: HeartPulse },
  { title: "Billing & Churn", url: "/admin/billing", icon: CreditCard },
  { title: "Security", url: "/admin/security", icon: Lock },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { open } = useSidebar();

  return (
    <Sidebar className="border-r">
      <SidebarContent>
        {/* The wordmark, at the weight the dashboard's own sidebar uses. The
            filled primary square with a dashboard glyph in it said "this is an
            app" beside the words that already say which app. */}
        <div className="border-b border-border/40 px-4 py-4">
          {open ? (
            <>
              <p className="text-[0.8125rem] font-semibold tracking-tight">
                <span className="text-foreground">Out</span>
                <span className="text-primary">Reign</span>
              </p>
              <p className="mt-0.5 text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground/60">
                Admin
              </p>
            </>
          ) : (
            <p className="text-center text-[0.8125rem] font-semibold text-primary">O</p>
          )}
        </div>

        <SidebarGroup>
          {/* Removed the "Navigation" label: a list of links in a sidebar does
              not need to be told it is navigation. */}
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.exact}
                      className="hover:bg-accent/50 transition-colors"
                      activeClassName="bg-accent text-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Was a button and, under it, a tinted box with a padlock announcing
            "Admin Access — elevated permissions enabled" to somebody who is
            looking at the admin panel. */}
        <div className="mt-auto border-t border-border/40 p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" />
              {open && <span className="ml-2">Back to dashboard</span>}
            </Link>
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}