import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, Activity, Clock, TrendingUp, ArrowLeft, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "down";
  uptime: number;
  responseTime: number;
  lastChecked: Date;
}

interface Incident {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  created_at: Date;
  resolved_at?: Date;
  updates: {
    message: string;
    timestamp: Date;
  }[];
}

const ApiStatus = () => {
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: "REST API",
      status: "operational",
      uptime: 99.98,
      responseTime: 125,
      lastChecked: new Date(),
    },
    {
      name: "GraphQL API",
      status: "operational",
      uptime: 99.95,
      responseTime: 180,
      lastChecked: new Date(),
    },
    {
      name: "Webhooks",
      status: "operational",
      uptime: 99.99,
      responseTime: 95,
      lastChecked: new Date(),
    },
    {
      name: "Database",
      status: "operational",
      uptime: 99.97,
      responseTime: 45,
      lastChecked: new Date(),
    },
    {
      name: "Edge Functions",
      status: "operational",
      uptime: 99.96,
      responseTime: 210,
      lastChecked: new Date(),
    },
  ]);

  const [incidents, setIncidents] = useState<Incident[]>([
    {
      id: "1",
      title: "Increased API Latency in US-East Region",
      status: "resolved",
      severity: "minor",
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      resolved_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600000),
      updates: [
        {
          message: "We have identified the issue and are working on a fix.",
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 1800000),
        },
        {
          message: "Issue has been resolved. API latency has returned to normal.",
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600000),
        },
      ],
    },
  ]);

  const [uptimeStats, setUptimeStats] = useState({
    last7Days: 99.97,
    last30Days: 99.95,
    last90Days: 99.94,
  });

  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      setServices((prev) =>
        prev.map((service) => ({
          ...service,
          responseTime: service.responseTime + Math.floor(Math.random() * 20 - 10),
          lastChecked: new Date(),
        }))
      );
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: ServiceStatus["status"]) => {
    switch (status) {
      case "operational":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "degraded":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case "down":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getStatusBadge = (status: ServiceStatus["status"]) => {
    switch (status) {
      case "operational":
        return <Badge className="bg-green-500">Operational</Badge>;
      case "degraded":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Degraded Performance</Badge>;
      case "down":
        return <Badge variant="destructive">Service Down</Badge>;
    }
  };

  const getSeverityBadge = (severity: Incident["severity"]) => {
    switch (severity) {
      case "minor":
        return <Badge variant="outline">Minor</Badge>;
      case "major":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Major</Badge>;
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
    }
  };

  const getIncidentStatusBadge = (status: Incident["status"]) => {
    switch (status) {
      case "investigating":
        return <Badge variant="outline" className="border-blue-500 text-blue-600">Investigating</Badge>;
      case "identified":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Identified</Badge>;
      case "monitoring":
        return <Badge variant="outline" className="border-purple-500 text-purple-600">Monitoring</Badge>;
      case "resolved":
        return <Badge className="bg-green-500">Resolved</Badge>;
    }
  };

  const overallStatus: ServiceStatus["status"] = services.every((s) => s.status === "operational")
    ? "operational"
    : services.some((s) => s.status === "down")
    ? "down"
    : "degraded";

  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 container mx-auto px-4 py-8 pt-12 max-w-6xl">
        <div className="space-y-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold">API Status</h1>
              <p className="text-muted-foreground">
                Real-time system status and incident history
              </p>
            </div>
            <Button variant="outline" asChild className="shrink-0 w-fit">
              <a href="/api-docs" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                API Docs
              </a>
            </Button>
          </div>

        <Card className={overallStatus === "operational" ? "border-green-500" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {overallStatus === "operational" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : overallStatus === "down" ? (
                  <XCircle className="w-5 h-5 text-destructive" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                )}
                <div>
                  <CardTitle>
                    {overallStatus === "operational"
                      ? "All Systems Operational"
                      : overallStatus === "down"
                      ? "System Outage"
                      : "Degraded Performance"}
                  </CardTitle>
                  <CardDescription>
                    Last updated: {new Date().toLocaleString()}
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">{uptimeStats.last30Days}%</p>
                <p className="text-xs text-muted-foreground">30-day uptime</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">7-Day Uptime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{uptimeStats.last7Days}%</span>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <Progress value={uptimeStats.last7Days} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">30-Day Uptime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{uptimeStats.last30Days}%</span>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <Progress value={uptimeStats.last30Days} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">90-Day Uptime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{uptimeStats.last90Days}%</span>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <Progress value={uptimeStats.last90Days} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Service Status</CardTitle>
            <CardDescription>Current status of all API services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {service.status === "operational" ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : service.status === "down" ? (
                      <XCircle className="w-5 h-5 text-destructive" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold">{service.name}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {service.uptime}% uptime
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {service.responseTime}ms avg
                        </div>
                      </div>
                    </div>
                  </div>
                  {getStatusBadge(service.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incident History</CardTitle>
            <CardDescription>Recent and ongoing incidents</CardDescription>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p>No incidents in the last 90 days</p>
              </div>
            ) : (
              <div className="space-y-6">
                {incidents.map((incident) => (
                  <div key={incident.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {getSeverityBadge(incident.severity)}
                          {getIncidentStatusBadge(incident.status)}
                        </div>
                        <h3 className="font-semibold text-lg">{incident.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {incident.created_at.toLocaleString()}
                          {incident.resolved_at && (
                            <>
                              {" - "}
                              Resolved {incident.resolved_at.toLocaleString()}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {incident.updates.map((update, index) => (
                        <div key={index} className="border-l-2 border-muted pl-4">
                          <p className="text-sm">{update.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {update.timestamp.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscribe to Updates</CardTitle>
            <CardDescription>
              Get notified about incidents and maintenance windows
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Subscribe to webhook notifications or RSS feed for real-time status updates
            </p>
            <div className="flex gap-2">
              <code className="bg-muted px-3 py-2 rounded text-xs flex-1">
                https://status.salesos.com/feed.rss
              </code>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ApiStatus;
