import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { UserPlus, Lock, Unlock, Trash2, Clock, Search, RefreshCw, Shield } from "lucide-react";

interface UserSubscription {
  user_id: string;
  email: string;
  full_name: string;
  plan: 'free' | 'starter' | 'growth' | 'pro' | 'elite';
  status: string;
  account_status: string;
  leads_limit: number;
  stripe_customer_id: string;
  current_period_end: string;
  trial_end_date: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

const AdminUsers = () => {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSubscription | null>(null);
  const [newUser, setNewUser] = useState({ 
    email: '', 
    password: '', 
    full_name: '', 
    plan: 'elite' as 'free' | 'starter' | 'growth' | 'pro' | 'elite',
    is_admin: true 
  });
  const [trialDays, setTrialDays] = useState(30);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSubscriptions();
    loadUserRoles();
  }, []);

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

  const loadUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (error) throw error;
      setUserRoles(data || []);
    } catch (error) {
      console.error('Error loading user roles:', error);
    }
  };

  const isUserAdmin = (userId: string) => {
    return userRoles.some(r => r.user_id === userId && r.role === 'admin');
  };

  const updateSubscription = async (userId: string, plan: 'free' | 'starter' | 'growth' | 'pro' | 'elite') => {
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
      toast.success(newUser.is_admin ? 'Admin team member created successfully' : 'User created successfully');
      setCreateUserOpen(false);
      setNewUser({ email: '', password: '', full_name: '', plan: 'elite', is_admin: true });
      loadSubscriptions();
      loadUserRoles();
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

  const toggleAdminStatus = async (userId: string, currentlyAdmin: boolean) => {
    try {
      if (currentlyAdmin) {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        if (error) throw error;
        
        // Update account_status back to active
        await supabase
          .from('subscriptions')
          .update({ account_status: 'active' })
          .eq('user_id', userId);
          
        toast.success('Admin privileges removed');
      } else {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin' });
        if (error) throw error;
        
        // Update account_status to admin
        await supabase
          .from('subscriptions')
          .update({ account_status: 'admin' })
          .eq('user_id', userId);
          
        toast.success('Admin privileges granted');
      }
      loadSubscriptions();
      loadUserRoles();
    } catch (error) {
      console.error('Error toggling admin status:', error);
      toast.error('Failed to update admin status');
    }
  };

  const getAccountStatusBadge = (userId: string, accountStatus: string, trialEndDate: string | null) => {
    if (isUserAdmin(userId)) {
      return <Badge className="gap-1 bg-primary"><Shield className="h-3 w-3" />Admin</Badge>;
    }
    if (accountStatus === 'admin') {
      return <Badge className="gap-1 bg-primary"><Shield className="h-3 w-3" />Admin</Badge>;
    }
    if (accountStatus === 'locked') {
      return <Badge variant="destructive">Locked</Badge>;
    }
    if (accountStatus === 'trial') {
      const daysLeft = trialEndDate ? Math.ceil((new Date(trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Trial ({daysLeft}d left)</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  const filteredSubscriptions = subscriptions.filter(sub => 
    sub.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="bg-muted/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">User Management</CardTitle>
              <CardDescription className="mt-1">
                View and manage all user accounts and subscriptions
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadSubscriptions} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={() => setCreateUserOpen(true)} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </div>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">Email</TableHead>
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Plan</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Account</TableHead>
                  <TableHead className="font-semibold">Leads</TableHead>
                  <TableHead className="font-semibold">Period End</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span className="text-muted-foreground">Loading...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((sub) => (
                    <TableRow key={sub.user_id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{sub.email}</TableCell>
                      <TableCell>{sub.full_name || <span className="text-muted-foreground">N/A</span>}</TableCell>
                      <TableCell>
                        <Select
                          value={sub.plan}
                          onValueChange={(value) => updateSubscription(sub.user_id, value as 'free' | 'starter' | 'growth' | 'pro' | 'elite')}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="starter">Starter</SelectItem>
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
                        {getAccountStatusBadge(sub.user_id, sub.account_status, sub.trial_end_date)}
                      </TableCell>
                      <TableCell>{sub.leads_limit.toLocaleString()}</TableCell>
                      <TableCell>
                        {new Date(sub.current_period_end).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-8 w-8 p-0 ${isUserAdmin(sub.user_id) ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => toggleAdminStatus(sub.user_id, isUserAdmin(sub.user_id))}
                            title={isUserAdmin(sub.user_id) ? 'Remove Admin' : 'Make Admin'}
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setSelectedUser(sub);
                              setTrialDialogOpen(true);
                            }}
                            title="Set Trial"
                          >
                            <Clock className="h-4 w-4" />
                          </Button>
                          {sub.account_status === 'locked' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => unlockUser(sub.user_id)}
                              title="Unlock Account"
                            >
                              <Unlock className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              onClick={() => lockUser(sub.user_id)}
                              title="Lock Account"
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedUser(sub);
                              setDeleteUserOpen(true);
                            }}
                            title="Delete User"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Create a new user account. Admin team members get full access without requiring payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="is_admin" className="text-base">Admin Access</Label>
                <p className="text-sm text-muted-foreground">
                  Admins get full platform access without paying
                </p>
              </div>
              <Switch
                id="is_admin"
                checked={newUser.is_admin}
                onCheckedChange={(checked) => setNewUser({ ...newUser, is_admin: checked })}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="teammate@company.com"
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
            <Button onClick={createUser}>
              {newUser.is_admin ? 'Add Admin' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteUserOpen} onOpenChange={setDeleteUserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user account for{' '}
              <strong>{selectedUser?.email}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteUser} className="bg-destructive hover:bg-destructive/90">
              Delete User
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
                onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)}
                min="0"
                max="365"
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
    </>
  );
};

export default AdminUsers;
