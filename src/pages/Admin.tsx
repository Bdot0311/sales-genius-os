import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAdmin } from "@/hooks/use-admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield } from "lucide-react";

interface UserSubscription {
  user_id: string;
  email: string;
  full_name: string;
  plan: 'growth' | 'pro' | 'elite';
  status: string;
  leads_limit: number;
  stripe_customer_id: string;
  current_period_end: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadSubscriptions();
    }
  }, [isAdmin]);

  const loadSubscriptions = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_all_subscriptions');
      
      if (error) throw error;
      
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const updateSubscription = async (userId: string, plan: 'growth' | 'pro' | 'elite') => {
    try {
      const { error } = await supabase.rpc('admin_update_subscription', {
        _user_id: userId,
        _plan: plan,
      });

      if (error) throw error;

      toast.success('Subscription updated successfully');
      loadSubscriptions();
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Failed to update subscription');
    }
  };

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'elite':
        return 'default';
      case 'pro':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (adminLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Manage user subscriptions and plans</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Subscriptions</CardTitle>
            <CardDescription>
              View and manage all user subscription plans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Current Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Leads Limit</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead>Update Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.user_id}>
                    <TableCell className="font-medium">{sub.email}</TableCell>
                    <TableCell>{sub.full_name || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={getPlanBadgeVariant(sub.plan)}>
                        {sub.plan.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{sub.leads_limit.toLocaleString()}</TableCell>
                    <TableCell>
                      {new Date(sub.current_period_end).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={sub.plan}
                        onValueChange={(value) => updateSubscription(sub.user_id, value as 'growth' | 'pro' | 'elite')}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="elite">Elite</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Admin;
