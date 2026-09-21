import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { UserSubscription } from "@/pages/admin/Users";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { maybeMask } from "@/lib/demo-mask";

export interface UserActivitySummary {
  last_active_at: string | null;
  minutes_7d: number;
  sessions_30d: number;
  page_views_30d: number;
  top_paths: string[];
}

interface UserTableProps {
  subscriptions: UserSubscription[];
  loading: boolean;
  isUserAdmin: (userId: string) => boolean;
  selectedIds: string[];
  onToggleSelect: (userId: string) => void;
  onToggleSelectAll: () => void;
  activity?: Record<string, UserActivitySummary>;
}

const getPlanBadgeClass = (plan: string) => {
  switch (plan) {
    case 'agency': return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
    case 'pro': return 'bg-primary/20 text-primary border-primary/30';
    case 'growth': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'starter': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getAccountBadge = (userId: string, accountStatus: string, trialEndDate: string | null, isAdmin: boolean) => {
  if (isAdmin) {
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

type AnswerSummary = { role: string | null; team_size: string | null; current_tooling: string | null };

export const UserTable = ({
  subscriptions, loading, isUserAdmin, selectedIds, onToggleSelect, onToggleSelectAll, activity,
}: UserTableProps) => {
  const { isDemoMode } = useDemoMode();
  const [answers, setAnswers] = useState<Record<string, AnswerSummary>>({});

  // Signup questionnaire answers, so who someone is is visible right in the list.
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("onboarding_responses")
      .select("user_id, role, team_size, current_tooling")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, AnswerSummary> = {};
        for (const row of data) {
          map[row.user_id] = {
            role: row.role,
            team_size: row.team_size,
            current_tooling: row.current_tooling,
          };
        }
        setAnswers(map);
      });
    return () => {
      cancelled = true;
    };
  }, []);


  const allSelected = subscriptions.length > 0 && subscriptions.every((s) => selectedIds.includes(s.user_id));
  const someSelected = subscriptions.some((s) => selectedIds.includes(s.user_id));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={onToggleSelectAll}
                aria-label="Select all users"
              />
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Active</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leads</TableHead>
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
              const checked = selectedIds.includes(sub.user_id);
              return (
                <TableRow
                  key={sub.user_id}
                  data-state={checked ? "selected" : undefined}
                  onClick={() => onToggleSelect(sub.user_id)}
                  className={`border-border/30 cursor-pointer transition-colors group ${checked ? 'bg-primary/10' : 'hover:bg-muted/20'}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleSelect(sub.user_id)}
                      aria-label={`Select ${sub.email}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {(sub.full_name || sub.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{maybeMask(isDemoMode, 'name', sub.full_name) || 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{maybeMask(isDemoMode, 'email', sub.email)}</p>
                        {sub.signup_source && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={sub.signup_source}>
                            via {sub.signup_source}
                          </p>
                        )}
                        {answers[sub.user_id] && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {[
                              answers[sub.user_id].role,
                              answers[sub.user_id].team_size,
                              answers[sub.user_id].current_tooling,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`capitalize border ${getPlanBadgeClass(sub.plan)}`}>{sub.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    {getAccountBadge(sub.user_id, sub.account_status, sub.trial_end_date, admin)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                    {sub.created_at
                      ? <span title={format(new Date(sub.created_at), 'PPpp')}>{format(new Date(sub.created_at), 'MMM d, yyyy')}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">
                    {(() => {
                      const act = activity?.[sub.user_id];
                      const lastActive = act?.last_active_at ? new Date(act.last_active_at) : null;
                      const online = lastActive ? Date.now() - lastActive.getTime() < 2 * 60 * 1000 : false;
                      // Live tracking only knows about visits since it was
                      // switched on, so an account that has signed in and got
                      // through onboarding was reading "Never opened app".
                      // Fall back to the sign-in we do know about, and keep
                      // "never" for accounts that genuinely never signed in.
                      const signedIn = sub.last_sign_in_at ? new Date(sub.last_sign_in_at) : null;
                      return (
                        <div className="space-y-0.5">
                          {online ? (
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                              Active now
                            </span>
                          ) : lastActive ? (
                            <span title={format(lastActive, 'PPpp')}>
                              {formatDistanceToNow(lastActive, { addSuffix: true })}
                            </span>
                          ) : signedIn ? (
                            <span title={format(signedIn, 'PPpp')}>
                              {formatDistanceToNow(signedIn, { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Never signed in</span>
                          )}
                          {act && act.minutes_7d > 0 ? (
                            <p className="text-[10px] text-muted-foreground">{act.minutes_7d}m in last 7d</p>
                          ) : signedIn ? (
                            <p className="text-[10px] text-muted-foreground">from last sign-in</p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {(admin || sub.leads_limit >= 99999)
                      ? <span className="text-xs text-primary font-medium">Unlimited</span>
                      : sub.leads_limit.toLocaleString()}
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
