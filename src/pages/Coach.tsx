import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Send, TrendingUp, Target, Lightbulb, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";

const Coach = () => {
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [coachingResponse, setCoachingResponse] = useState("");
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeDeals: 0,
    pipelineValue: 0,
    avgDealSize: 0,
    closeRate: 0,
    upcomingMeetings: 0,
  });
  const { toast } = useToast();

  if (subscriptionLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!subscription?.hasAiCoach) {
    return (
      <DashboardLayout>
        <UpgradePrompt feature="AI Sales Coach" requiredPlan="pro" />
      </DashboardLayout>
    );
  }

  useEffect(() => {
    loadStats();
    
    // Set up real-time subscriptions
    const leadsChannel = supabase
      .channel('leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        loadStats();
      })
      .subscribe();

    const dealsChannel = supabase
      .channel('deals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        loadStats();
      })
      .subscribe();

    const activitiesChannel = supabase
      .channel('activities-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        loadStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(activitiesChannel);
    };
  }, []);

  const loadStats = async () => {
    try {
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: deals } = await supabase.from("deals").select("*");
      const { data: activities } = await supabase
        .from("activities")
        .select("*")
        .eq("type", "meeting")
        .gte("due_date", new Date().toISOString());

      const totalLeads = leads?.length || 0;
      const activeDeals = deals?.length || 0;
      const pipelineValue = deals?.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0) || 0;
      const avgDealSize = activeDeals > 0 ? Math.round(pipelineValue / activeDeals) : 0;
      const closedDeals = deals?.filter(d => d.stage === 'closed-won').length || 0;
      const closeRate = totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 100) : 0;

      setStats({
        totalLeads,
        activeDeals,
        pipelineValue,
        avgDealSize,
        closeRate,
        upcomingMeetings: activities?.length || 0,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setCoachingResponse("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: { 
          question: input,
          userData: stats
        },
      });

      if (error) throw error;

      setCoachingResponse(data.coaching);
      setInput("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to get coaching response",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    setInput(question);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI Sales Coach</h1>
          <p className="text-muted-foreground">
            Get personalized coaching and insights to improve your sales performance
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Performance
              </CardTitle>
              <CardDescription>Your recent sales metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Close Rate</span>
                  <Badge variant="outline">{stats.closeRate}%</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Deal Size</span>
                  <Badge variant="outline">${stats.avgDealSize.toLocaleString()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Upcoming Meetings</span>
                  <Badge variant="outline">{stats.upcomingMeetings}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Goals
              </CardTitle>
              <CardDescription>Your current objectives</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Leads</span>
                  <Badge className="bg-green-500">{stats.totalLeads}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Active Deals</span>
                  <Badge className="bg-blue-500">{stats.activeDeals}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Pipeline Value</span>
                  <Badge className="bg-purple-500">${stats.pipelineValue.toLocaleString()}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                Recommendations
              </CardTitle>
              <CardDescription>AI-powered insights</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.totalLeads > 0 ? (
                <div className="space-y-2 text-sm">
                  {stats.upcomingMeetings > 0 && (
                    <p>• Prepare for {stats.upcomingMeetings} upcoming meeting{stats.upcomingMeetings > 1 ? 's' : ''}</p>
                  )}
                  {stats.activeDeals > 0 && (
                    <p>• Focus on closing ${stats.pipelineValue.toLocaleString()} in pipeline</p>
                  )}
                  {stats.closeRate > 0 && stats.closeRate < 25 && (
                    <p>• Work on improving your {stats.closeRate}% close rate</p>
                  )}
                  {stats.totalLeads > 0 && stats.activeDeals === 0 && (
                    <p>• Convert some of your {stats.totalLeads} leads into deals</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Add leads to get AI-powered insights</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ask Your AI Coach</CardTitle>
            <CardDescription>
              Get personalized advice, practice objection handling, or analyze your sales calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleQuickQuestion("How can I improve my close rate?")}
                >
                  Improve close rate
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleQuickQuestion("What should I focus on this week?")}
                >
                  Weekly priorities
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleQuickQuestion("How do I handle price objections?")}
                >
                  Handle objections
                </Button>
              </div>

              <Textarea
                placeholder="Type your question or describe a sales scenario you need help with..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="min-h-[120px]"
              />

              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !input.trim()}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Thinking...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Get Coaching
                    </>
                  )}
                </Button>
              </div>

              {coachingResponse && (
                <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-primary" />
                    Coach's Advice:
                  </h4>
                  <p className="text-sm whitespace-pre-wrap">{coachingResponse}</p>
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-accent/50 rounded-lg">
              <h4 className="font-semibold mb-2">Example Questions:</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• "How do I handle price objections for enterprise deals?"</li>
                <li>• "What's the best way to follow up after a demo?"</li>
                <li>• "Help me prepare for a call with a CFO"</li>
                <li>• "Review my email template for cold outreach"</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Coach;
