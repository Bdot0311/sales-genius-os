import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Clock, Lock, Unlock, Trash2 } from "lucide-react";
import type { UserSubscription } from "@/pages/admin/Users";

interface UserTableProps {
  subscriptions: UserSubscription[];
  loading: boolean;
  isUserAdmin: (userId: string) => boolean;
  onUpdateSubscription: (userId: string, plan: 'free' | 'starter' | 'growth' | 'pro') => void;
  onLockUser: (userId: string) => void;
  onUnlockUser: (userId: string) => void;
  onToggleAdmin: (userId: string, isAdmin: boolean) => void;
  onSetTrial: (user: UserSubscription) => void;
  onDeleteUser: (user: UserSubscription) => void;
}

const getPlanBadgeClass = (plan: string) => {
  switch (plan) {
    case 'pro': return 'bg-primary/20 text-primary border-primary/30';
    case 'growth': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'starter': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getAccountBadge = (userId: string, accountStatus: string, trialEndDate: string | null, isAdmin: boolean) => {
  if (isAdmin || accountStatus === 'admin') {
    return <Badge className="gap-1 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"><Shield className="h-3 w-3" />Admin</Badge>;
  }
  if (accountStatus === 'locked') {
    return <Badge className="bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30">Locked</Badge>;
  }
  if (accountStatus === 'trial') {
    const daysLeft = trialEndDate ? Math.ceil((new Date(trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    return <Badge className="gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"><Clock className="h-3 w-3" />Trial ({daysLeft}d)</Badge>;
  }
  return <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30">Active</Badge>;
};

export const UserTable = ({
  subscriptions, loading, isUserAdmin,
  onUpdateSubscription, onLockUser, onUnlockUser, onToggleAdmin, onSetTrial, onDeleteUser
}: UserTableProps) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leads</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period End</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                  <span className="text-muted-foreground">Loading users...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : subscriptions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                No users found
              </TableCell>
            </TableRow>
          ) : (
            subscriptions.map((sub) => {
              const admin = isUserAdmin(sub.user_id);
              return (
                <TableRow key={sub.user_id} className="border-border/30 hover:bg-muted/20 transition-colors group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {(sub.full_name || sub.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{sub.full_name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{sub.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={sub.plan}
                      onValueChange={(v) => onUpdateSubscription(sub.user_id, v as any)}
                    >
                      <SelectTrigger className={`w-28 h-7 text-xs border ${getPlanBadgeClass(sub.plan)} bg-transparent`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sub.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getAccountBadge(sub.user_id, sub.account_status, sub.trial_end_date, admin)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{sub.leads_limit.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {new Date(sub.current_period_end).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm" variant="ghost"
                        className={`h-7 w-7 p-0 ${admin ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => onToggleAdmin(sub.user_id, admin)}
                        title={admin ? 'Remove Admin' : 'Make Admin'}
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => onSetTrial(sub)}
                        title="Set Trial"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                      {sub.account_status === 'locked' ? (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300"
                          onClick={() => onUnlockUser(sub.user_id)}
                          title="Unlock"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-amber-400 hover:text-amber-300"
                          onClick={() => onLockUser(sub.user_id)}
                          title="Lock"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDeleteUser(sub)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
