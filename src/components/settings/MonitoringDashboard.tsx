import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export const MonitoringDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    loadMetrics();
    
    // Set up real-time subscription for updates
    const channel = supabase
      .channel('monitoring-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'api_usage_log' }, () => {
        loadMetrics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'webhook_deliveries' }, () => {
        loadMetrics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMetrics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get API keys for this user
      const { data: apiKeys } = await supabase
        .from("api_keys")
        .select("id, name");

      const apiKeyIds = apiKeys?.map(k => k.id) || [];

      // Get last 24 hours of API usage
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: apiUsage } = await supabase
        .from("api_usage_log")
        .select("*")
        .in("api_key_id", apiKeyIds)
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: true });

      // Get webhooks
      const { data: webhooks } = await supabase
        .from("webhooks")
        .select("id, name");

      const webhookIds = webhooks?.map(w => w.id) || [];

      // Get webhook deliveries
      const { data: webhookDeliveries } = await supabase
        .from("webhook_deliveries")
        .select("*")
        .in("webhook_id", webhookIds)
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: true });

      // Calculate metrics
      const totalRequests = apiUsage?.length || 0;
      const successfulRequests = apiUsage?.filter(r => r.status_code && r.status_code < 400).length || 0;
      const failedRequests = totalRequests - successfulRequests;
      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(1) : "0";
      
      const avgResponseTime = apiUsage?.length
        ? (apiUsage.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / apiUsage.length).toFixed(0)
        : "0";

      const totalWebhooks = webhookDeliveries?.length || 0;
      const successfulWebhooks = webhookDeliveries?.filter(d => d.status === 'success').length || 0;
      const failedWebhooks = webhookDeliveries?.filter(d => d.status === 'failed').length || 0;
      const webhookSuccessRate = totalWebhooks > 0 ? (successfulWebhooks / totalWebhooks * 100).toFixed(1) : "0";

      // Group by hour for time series
      const hourlyData = new Map();
      apiUsage?.forEach(log => {
        const hour = new Date(log.created_at).getHours();
        if (!hourlyData.has(hour)) {
          hourlyData.set(hour, { hour, requests: 0, errors: 0, avgResponseTime: [] });
        }
        const data = hourlyData.get(hour);
        data.requests++;
        if (log.status_code && log.status_code >= 400) data.errors++;
        if (log.response_time_ms) data.avgResponseTime.push(log.response_time_ms);
      });

      const timeSeriesData = Array.from(hourlyData.values()).map(d => ({
        hour: `${d.hour}:00`,
        requests: d.requests,
        errors: d.errors,
        avgResponseTime: d.avgResponseTime.length > 0 
          ? Math.round(d.avgResponseTime.reduce((a, b) => a + b, 0) / d.avgResponseTime.length)
          : 0,
      }));

      // Endpoint breakdown
      const endpointStats = new Map();
      apiUsage?.forEach(log => {
        if (!endpointStats.has(log.endpoint)) {
          endpointStats.set(log.endpoint, { endpoint: log.endpoint, count: 0, errors: 0 });
        }
        const stats = endpointStats.get(log.endpoint);
        stats.count++;
        if (log.status_code && log.status_code >= 400) stats.errors++;
      });

      const endpointData = Array.from(endpointStats.values()).slice(0, 5);

      setMetrics({
        totalRequests,
        successfulRequests,
        failedRequests,
        successRate,
        avgResponseTime,
        totalWebhooks,
        successfulWebhooks,
        failedWebhooks,
        webhookSuccessRate,
        timeSeriesData,
        endpointData,
        statusDistribution: [
          { name: 'Success', value: successfulRequests, color: '#10B981' },
          { name: 'Error', value: failedRequests, color: '#EF4444' },
        ],
        webhookDistribution: [
          { name: 'Success', value: successfulWebhooks, color: '#10B981' },
          { name: 'Failed', value: failedWebhooks, color: '#EF4444' },
        ],
      });
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No monitoring data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalRequests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            {parseFloat(metrics.successRate) >= 95 ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.failedRequests} errors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            {parseInt(metrics.avgResponseTime) < 500 ? (
              <TrendingDown className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingUp className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgResponseTime}ms</div>
            <p className="text-xs text-muted-foreground">Across all endpoints</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Webhook Success</CardTitle>
            {parseFloat(metrics.webhookSuccessRate) >= 90 ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.webhookSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalWebhooks} deliveries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Request Volume Over Time</CardTitle>
          <CardDescription>Hourly breakdown of API requests and errors</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="requests" stroke="#8B5CF6" name="Requests" />
              <Line type="monotone" dataKey="errors" stroke="#EF4444" name="Errors" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Response Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Response Times</CardTitle>
            <CardDescription>Average response time by hour</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgResponseTime" fill="#6366F1" name="Avg Time (ms)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Request Status Distribution</CardTitle>
            <CardDescription>Success vs Error rate</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={metrics.statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {metrics.statusDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Endpoints */}
      {metrics.endpointData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Endpoints</CardTitle>
            <CardDescription>Most requested API endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.endpointData.map((endpoint: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium font-mono text-sm">{endpoint.endpoint}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{endpoint.count} requests</Badge>
                      {endpoint.errors > 0 && (
                        <Badge variant="destructive">{endpoint.errors} errors</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
