import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Mail, MousePointerClick, MessageSquareReply, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TemplatePerformance {
  template_id: string;
  template_name: string;
  total_sent: number;
  total_opened: number;
  total_replied: number;
  total_clicked: number;
  open_rate: number;
  reply_rate: number;
  click_rate: number;
}

export const EmailPerformanceStats = () => {
  const [performance, setPerformance] = useState<TemplatePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallStats, setOverallStats] = useState({
    totalSent: 0,
    totalOpened: 0,
    totalReplied: 0,
    avgOpenRate: 0,
    avgReplyRate: 0,
  });

  useEffect(() => {
    loadPerformance();
  }, []);

  const loadPerformance = async () => {
    try {
      // Load template performance from view
      const { data: templateData, error: templateError } = await supabase
        .from('template_performance')
        .select('*')
        .order('total_sent', { ascending: false });

      if (templateError) {
        console.error('Error loading template performance:', templateError);
      } else {
        setPerformance(templateData || []);
      }

      // Load overall stats from sent_emails
      const { data: emailStats, error: statsError } = await supabase
        .from('sent_emails')
        .select('id, opened_at, replied_at');

      if (!statsError && emailStats) {
        const totalSent = emailStats.length;
        const totalOpened = emailStats.filter(e => e.opened_at).length;
        const totalReplied = emailStats.filter(e => e.replied_at).length;
        
        setOverallStats({
          totalSent,
          totalOpened,
          totalReplied,
          avgOpenRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          avgReplyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
        });
      }
    } catch (error) {
      console.error('Error loading performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceBadge = (rate: number, type: 'open' | 'reply') => {
    const thresholds = type === 'open' 
      ? { good: 40, average: 20 }
      : { good: 10, average: 5 };

    if (rate >= thresholds.good) {
      return <Badge className="bg-primary text-primary-foreground">Excellent</Badge>;
    } else if (rate >= thresholds.average) {
      return <Badge variant="secondary">Average</Badge>;
    } else {
      return <Badge variant="outline">Needs Work</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overallStats.totalSent}</p>
                <p className="text-xs text-muted-foreground">Emails Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary/50 rounded-lg">
                <Eye className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overallStats.avgOpenRate}%</p>
                <p className="text-xs text-muted-foreground">Avg Open Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/50 rounded-lg">
                <MessageSquareReply className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overallStats.avgReplyRate}%</p>
                <p className="text-xs text-muted-foreground">Avg Reply Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <BarChart3 className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{performance.length}</p>
                <p className="text-xs text-muted-foreground">Templates Used</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Template Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {performance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No template performance data yet</p>
              <p className="text-sm">Send emails using templates to see metrics here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {performance.map((template) => (
                <div key={template.template_id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{template.template_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {template.total_sent} emails sent
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {getPerformanceBadge(template.open_rate, 'open')}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Open Rate
                        </span>
                        <span className="text-xs font-medium">{template.open_rate}%</span>
                      </div>
                      <Progress value={template.open_rate} className="h-2" />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MessageSquareReply className="w-3 h-3" /> Reply Rate
                        </span>
                        <span className="text-xs font-medium">{template.reply_rate}%</span>
                      </div>
                      <Progress value={template.reply_rate * 5} className="h-2" />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MousePointerClick className="w-3 h-3" /> Click Rate
                        </span>
                        <span className="text-xs font-medium">{template.click_rate}%</span>
                      </div>
                      <Progress value={template.click_rate * 5} className="h-2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
