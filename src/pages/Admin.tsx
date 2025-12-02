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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, UserPlus, Lock, Unlock, Trash2, Clock } from "lucide-react";

interface UserSubscription {
  user_id: string;
  email: string;
  full_name: string;
  plan: 'growth' | 'pro' | 'elite';
  status: string;
  account_status: string;
  leads_limit: number;
  stripe_customer_id: string;
  current_period_end: string;
  trial_end_date: string | null;
}

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSubscription | null>(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', plan: 'growth' as 'growth' | 'pro' | 'elite' });
  const [trialDays, setTrialDays] = useState(30);

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

  const createUser = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: newUser
      });

      if (error) throw error;

      toast.success('User created successfully');
      setCreateUserOpen(false);
      setNewUser({ email: '', password: '', full_name: '', plan: 'growth' });
      loadSubscriptions();
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    }
  };

  const deleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        _user_id: selectedUser.user_id
      });

      if (error) throw error;

      toast.success('User deleted successfully');
      setDeleteUserOpen(false);
      setSelectedUser(null);
      loadSubscriptions();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  };

  const lockUser = async (userId: string, reason?: string) => {
    try {
      const { error } = await supabase.rpc('admin_lock_user', {
        _user_id: userId,
        _reason: reason || 'Payment failed'
      });

      if (error) throw error;

      toast.success('User account locked');
      loadSubscriptions();
    } catch (error) {
      console.error('Error locking user:', error);
      toast.error('Failed to lock user');
    }
  };

  const unlockUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_unlock_user', {
        _user_id: userId
      });

      if (error) throw error;

      toast.success('User account unlocked');
      loadSubscriptions();
    } catch (error) {
      console.error('Error unlocking user:', error);
      toast.error('Failed to unlock user');
    }
  };

  const setTrial = async () => {
    if (!selectedUser) return;

    try {
      const { error } = await supabase.rpc('admin_set_trial', {
        _user_id: selectedUser.user_id,
        _trial_days: trialDays
      });

      if (error) throw error;

      toast.success(`Trial set for ${trialDays} days`);
      setTrialDialogOpen(false);
      setSelectedUser(null);
      loadSubscriptions();
    } catch (error) {
      console.error('Error setting trial:', error);
      toast.error('Failed to set trial');
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

  const getAccountStatusBadge = (accountStatus: string, trialEndDate: string | null) => {
    if (accountStatus === 'locked') {
      return <Badge variant="destructive">Locked</Badge>;
    }
    if (accountStatus === 'trial') {
      const daysLeft = trialEndDate ? Math.ceil((new Date(trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Trial ({daysLeft}d left)</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Admin Panel</h1>
              <p className="text-muted-foreground">Manage user subscriptions and accounts</p>
            </div>
          </div>
          <Button onClick={() => setCreateUserOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
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
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => (
                  <TableRow key={sub.user_id}>
                    <TableCell className="font-medium">{sub.email}</TableCell>
                    <TableCell>{sub.full_name || 'N/A'}</TableCell>
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
                    <TableCell>
                      <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getAccountStatusBadge(sub.account_status, sub.trial_end_date)}
                    </TableCell>
                    <TableCell>{sub.leads_limit.toLocaleString()}</TableCell>
                    <TableCell>
                      {new Date(sub.current_period_end).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUser(sub);
                            setTrialDialogOpen(true);
                          }}
                        >
                          <Clock className="h-3 w-3" />
                        </Button>
                        {sub.account_status === 'locked' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unlockUser(sub.user_id)}
                          >
                            <Unlock className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => lockUser(sub.user_id)}
                          >
                            <Lock className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedUser(sub);
                            setDeleteUserOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Manually create a new user account with subscription
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="plan">Plan</Label>
              <Select
                value={newUser.plan}
                onValueChange={(value) => setNewUser({ ...newUser, plan: value as 'growth' | 'pro' | 'elite' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="elite">Elite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteUserOpen} onOpenChange={setDeleteUserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUser?.email}? This will permanently delete
              their account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteUser} className="bg-destructive text-destructive-foreground">
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Trial Dialog */}
      <Dialog open={trialDialogOpen} onOpenChange={setTrialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Trial Period</DialogTitle>
            <DialogDescription>
              Set trial period for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="trial_days">Trial Days</Label>
              <Input
                id="trial_days"
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(parseInt(e.target.value) || 30)}
                placeholder="30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={setTrial}>Set Trial</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Admin;
