import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, AreaChart, Area } from "recharts";
import { TrendingUp, Users, DollarSign, CreditCard, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AdminAnalytics = () => {
  const [timeRange, setTimeRange] = useState("30d");
  const [stats, setStats] = useState({
    totalUsers: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    churnRate: 2.5,
  });

  // Mock data for charts - in production, this would come from aggregated database queries
  const userGrowthData = [
    { month: 'Jul', users: 120, newUsers: 35 },
    { month: 'Aug', users: 155, newUsers: 42 },
    { month: 'Sep', users: 189, newUsers: 38 },
    { month: 'Oct', users: 234, newUsers: 52 },
    { month: 'Nov', users: 287, newUsers: 61 },
    { month: 'Dec', users: 342, newUsers: 68 },
  ];

  const revenueData = [
    { month: 'Jul', revenue: 12400, mrr: 11200 },
    { month: 'Aug', revenue: 15800, mrr: 14100 },
    { month: 'Sep', revenue: 18200, mrr: 16500 },
    { month: 'Oct', revenue: 22100, mrr: 19800 },
    { month: 'Nov', revenue: 26500, mrr: 23400 },
    { month: 'Dec', revenue: 31200, mrr: 27800 },
  ];

  const subscriptionDistribution = [
    { name: 'Growth', value: 45, color: 'hsl(var(--chart-1))' },
    { name: 'Pro', value: 35, color: 'hsl(var(--chart-2))' },
    { name: 'Elite', value: 20, color: 'hsl(var(--chart-3))' },
  ];

  const dailyActiveUsers = [
    { day: 'Mon', active: 234 },
    { day: 'Tue', active: 256 },
    { day: 'Wed', active: 278 },
    { day: 'Thu', active: 245 },
    { day: 'Fri', active: 289 },
    { day: 'Sat', active: 156 },
    { day: 'Sun', active: 134 },
  ];

  const conversionData = [
    { stage: 'Visitors', count: 10000 },
    { stage: 'Sign Ups', count: 1200 },
    { stage: 'Free Trial', count: 800 },
    { stage: 'Paid', count: 342 },
  ];

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_dashboard_stats');
      if (error) throw error;
      if (data && data[0]) {
        setStats({
          totalUsers: data[0].total_users || 0,
          monthlyRevenue: data[0].monthly_revenue || 0,
          activeSubscriptions: data[0].active_subscriptions || 0,
          churnRate: 2.5,
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const chartConfig = {
    users: { label: "Total Users", color: "hsl(var(--chart-1))" },
    newUsers: { label: "New Users", color: "hsl(var(--chart-2))" },
    revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
    mrr: { label: "MRR", color: "hsl(var(--chart-2))" },
    active: { label: "Active Users", color: "hsl(var(--chart-3))" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Analytics</h2>
            <p className="text-muted-foreground">Detailed insights and metrics</p>
          </div>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
                <p className="text-xs text-emerald-500">+12% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-emerald-500/10">
                <DollarSign className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                <p className="text-2xl font-bold">${stats.monthlyRevenue.toLocaleString()}</p>
                <p className="text-xs text-emerald-500">+18% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-500/10">
                <CreditCard className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Subscriptions</p>
                <p className="text-2xl font-bold">{stats.activeSubscriptions}</p>
                <p className="text-xs text-emerald-500">+8% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <TrendingUp className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Churn Rate</p>
                <p className="text-2xl font-bold">{stats.churnRate}%</p>
                <p className="text-xs text-destructive">+0.3% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="growth" className="space-y-4">
        <TabsList>
          <TabsTrigger value="growth">User Growth</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>

        <TabsContent value="growth" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>User Growth Over Time</CardTitle>
                <CardDescription>Total users and new signups by month</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <AreaChart data={userGrowthData}>
                    <defs>
                      <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="users" stroke="hsl(var(--chart-1))" fill="url(#fillUsers)" />
                    <Line type="monotone" dataKey="newUsers" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 4 }} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion Funnel</CardTitle>
                <CardDescription>User journey from visitor to paid customer</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <BarChart data={conversionData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="stage" type="category" className="text-xs" width={80} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trends</CardTitle>
              <CardDescription>Monthly revenue and MRR over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[400px]">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(value) => `$${value / 1000}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => `$${Number(value).toLocaleString()}`} />} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={3} dot={{ r: 5 }} name="Total Revenue" />
                  <Line type="monotone" dataKey="mrr" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={{ r: 5 }} name="MRR" />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Distribution</CardTitle>
                <CardDescription>Breakdown by plan type</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <PieChart>
                    <Pie
                      data={subscriptionDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {subscriptionDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Plan Revenue Breakdown</CardTitle>
                <CardDescription>Revenue contribution by plan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
                      <span>Growth Plan</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">$4,410</p>
                      <p className="text-xs text-muted-foreground">90 users × $49</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-2))]" />
                      <span>Pro Plan</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">$13,930</p>
                      <p className="text-xs text-muted-foreground">70 users × $199</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-3))]" />
                      <span>Elite Plan</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">$19,960</p>
                      <p className="text-xs text-muted-foreground">40 users × $499</p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="font-medium">Total MRR</span>
                    <span className="font-bold text-lg">$38,300</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Active Users</CardTitle>
              <CardDescription>User engagement throughout the week</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <BarChart data={dailyActiveUsers}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="active" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAnalytics;
