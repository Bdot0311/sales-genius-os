import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { PLAN_CONFIG, type PlanType } from "@/lib/stripe-config";
import { 
  Coins, 
  TrendingUp, 
  Calendar, 
  Clock, 
  ArrowDownCircle, 
  ArrowUpCircle,
  RefreshCw,
  Zap,
  History
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export const CreditsUsageTab = () => {
  const { credits, loading, fetchCredits } = useSearchCredits();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  // Fetch transactions
  const fetchTransactions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('search_transactions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Set up realtime subscriptions
  useEffect(() => {
    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Subscribe to subscription changes
      const subscriptionChannel = supabase
        .channel('credits-subscription-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'subscriptions',
            filter: `user_id=eq.${session.user.id}`
          },
          () => {
            // Refresh credits when subscription changes
            fetchCredits();
          }
        )
        .subscribe();

      // Subscribe to transaction changes
      const transactionChannel = supabase
        .channel('credits-transaction-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'search_transactions',
            filter: `user_id=eq.${session.user.id}`
          },
          (payload) => {
            // Add new transaction to the list
            setTransactions(prev => [payload.new as Transaction, ...prev].slice(0, 50));
            // Also refresh credits
            fetchCredits();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscriptionChannel);
        supabase.removeChannel(transactionChannel);
      };
    };

    setupRealtime();
  }, [fetchCredits]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!credits) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No subscription data available
        </CardContent>
      </Card>
    );
  }

  const planConfig = PLAN_CONFIG[credits.plan as PlanType];
  const creditsUsedPercentage = credits.totalCredits > 0 
    ? ((credits.totalCredits - credits.remainingCredits) / credits.totalCredits) * 100 
    : 0;
  const dailyUsedPercentage = credits.dailySearchLimit > 0 
    ? (credits.dailySearchesUsed / credits.dailySearchLimit) * 100 
    : 0;

  const getResetTimeDisplay = () => {
    if (!credits.creditsResetAt) return 'End of billing period';
    const resetDate = new Date(credits.creditsResetAt);
    return formatDistanceToNow(resetDate, { addSuffix: true });
  };

  return (
    <div className="space-y-6">
      {/* Credits Overview Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Monthly Credits Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              Monthly Search Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{credits.remainingCredits}</span>
                <span className="text-sm text-muted-foreground">
                  of {credits.totalCredits}
                </span>
              </div>
              <Progress value={100 - creditsUsedPercentage} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{credits.totalCredits - credits.remainingCredits} used</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Resets {getResetTimeDisplay()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Searches Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Daily Searches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">
                  {credits.dailySearchLimit - credits.dailySearchesUsed}
                </span>
                <span className="text-sm text-muted-foreground">
                  of {credits.dailySearchLimit} remaining
                </span>
              </div>
              <Progress 
                value={100 - dailyUsedPercentage} 
                className={`h-2 ${dailyUsedPercentage > 80 ? '[&>div]:bg-amber-500' : ''}`} 
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{credits.dailySearchesUsed} used today</span>
                <span>Resets at midnight</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plan Info Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold capitalize">{credits.plan}</span>
                <Badge variant="secondary">${planConfig.price}/mo</Badge>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Base Credits</span>
                  <span>{credits.baseCredits}</span>
                </div>
                {credits.addonCredits > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Addon Credits</span>
                    <span>+{credits.addonCredits}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Limits Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Plan Limits
          </CardTitle>
          <CardDescription>
            Your {credits.plan} plan includes the following search limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-primary/10">
                <Coins className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{planConfig.monthlyProspects}</p>
                <p className="text-xs text-muted-foreground">Monthly Prospects</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{planConfig.dailyLimit}</p>
                <p className="text-xs text-muted-foreground">Daily Limit</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium capitalize">{planConfig.exportTier}</p>
                <p className="text-xs text-muted-foreground">Export Tier</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Transaction History
              </CardTitle>
              <CardDescription>
                Recent credit usage and additions
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setLoadingTransactions(true);
                fetchTransactions();
              }}
              disabled={loadingTransactions}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingTransactions ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTransactions ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No transactions yet</p>
              <p className="text-sm">Your search credit usage will appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {tx.amount < 0 ? (
                        <div className="p-2 rounded-full bg-red-500/10">
                          <ArrowDownCircle className="h-4 w-4 text-red-500" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-full bg-green-500/10">
                          <ArrowUpCircle className="h-4 w-4 text-green-500" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {tx.description || (tx.amount < 0 ? 'Credit Used' : 'Credits Added')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${tx.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Balance: {tx.balance_after}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
