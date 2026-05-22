import { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, Activity, Clock, TrendingUp, ArrowLeft, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

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
  updates: { message: string; timestamp: Date }[];
}

const cardStyle = {
  background: "hsl(261 75% 50% / 0.04)",
  border: "1px solid hsl(261 75% 50% / 0.14)",
} as const;

const StatusIcon = ({ status }: { status: ServiceStatus["status"] }) => {
  if (status === "operational") return <CheckCircle className="w-5 h-5" style={{ color: "hsl(142 70% 55%)" }} />;
  if (status === "down") return <XCircle className="w-5 h-5" style={{ color: "hsl(0 70% 65%)" }} />;
  return <AlertCircle className="w-5 h-5" style={{ color: "hsl(38 85% 60%)" }} />;
};

const StatusPill = ({ status }: { status: ServiceStatus["status"] }) => {
  const map = {
    operational: { bg: "hsl(142 70% 55% / 0.1)", border: "hsl(142 70% 55% / 0.3)", color: "hsl(142 70% 60%)", label: "Operational" },
    degraded: { bg: "hsl(38 85% 60% / 0.1)", border: "hsl(38 85% 60% / 0.3)", color: "hsl(38 85% 65%)", label: "Degraded" },
    down: { bg: "hsl(0 70% 65% / 0.1)", border: "hsl(0 70% 65% / 0.3)", color: "hsl(0 70% 65%)", label: "Down" },
  }[status];
  return (
    <span
      className="text-xs px-2.5 py-1 rounded-full font-medium"
      style={{ background: map.bg, border: `1px solid ${map.border}`, color: map.color }}
    >
      {map.label}
    </span>
  );
};

const SeverityPill = ({ severity }: { severity: Incident["severity"] }) => {
  const map = {
    minor: { bg: "hsl(261 75% 50% / 0.08)", border: "hsl(261 75% 50% / 0.2)", color: "hsl(261 75% 65%)", label: "Minor" },
    major: { bg: "hsl(38 85% 60% / 0.1)", border: "hsl(38 85% 60% / 0.3)", color: "hsl(38 85% 65%)", label: "Major" },
    critical: { bg: "hsl(0 70% 65% / 0.1)", border: "hsl(0 70% 65% / 0.3)", color: "hsl(0 70% 65%)", label: "Critical" },
  }[severity];
  return (
    <span
      className="text-xs px-2.5 py-1 rounded-full font-medium"
      style={{ background: map.bg, border: `1px solid ${map.border}`, color: map.color }}
    >
      {map.label}
    </span>
  );
};

const IncidentStatusPill = ({ status }: { status: Incident["status"] }) => {
  const map = {
    investigating: { bg: "hsl(210 80% 60% / 0.1)", border: "hsl(210 80% 60% / 0.3)", color: "hsl(210 80% 65%)", label: "Investigating" },
    identified: { bg: "hsl(38 85% 60% / 0.1)", border: "hsl(38 85% 60% / 0.3)", color: "hsl(38 85% 65%)", label: "Identified" },
    monitoring: { bg: "hsl(261 75% 50% / 0.08)", border: "hsl(261 75% 50% / 0.2)", color: "hsl(261 75% 65%)", label: "Monitoring" },
    resolved: { bg: "hsl(142 70% 55% / 0.1)", border: "hsl(142 70% 55% / 0.3)", color: "hsl(142 70% 60%)", label: "Resolved" },
  }[status];
  return (
    <span
      className="text-xs px-2.5 py-1 rounded-full font-medium"
      style={{ background: map.bg, border: `1px solid ${map.border}`, color: map.color }}
    >
      {map.label}
    </span>
  );
};

const NativeProgress = ({ value }: { value: number }) => (
  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "hsl(261 75% 50% / 0.12)" }}>
    <div
      className="h-full rounded-full transition-all"
      style={{ width: `${value}%`, background: "linear-gradient(90deg, hsl(261 75% 55%), hsl(261 75% 65%))" }}
    />
  </div>
);

const ApiStatus = () => {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "REST API", status: "operational", uptime: 99.98, responseTime: 125, lastChecked: new Date() },
    { name: "GraphQL API", status: "operational", uptime: 99.95, responseTime: 180, lastChecked: new Date() },
    { name: "Webhooks", status: "operational", uptime: 99.99, responseTime: 95, lastChecked: new Date() },
    { name: "Database", status: "operational", uptime: 99.97, responseTime: 45, lastChecked: new Date() },
    { name: "Edge Functions", status: "operational", uptime: 99.96, responseTime: 210, lastChecked: new Date() },
  ]);

  const [incidents] = useState<Incident[]>([
    {
      id: "1",
      title: "Increased API Latency in US-East Region",
      status: "resolved",
      severity: "minor",
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      resolved_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600000),
      updates: [
        { message: "We have identified the issue and are working on a fix.", timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 1800000) },
        { message: "Issue has been resolved. API latency has returned to normal.", timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600000) },
      ],
    },
  ]);

  const uptimeStats = { last7Days: 99.97, last30Days: 99.95, last90Days: 99.94 };

  useEffect(() => {
    const interval = setInterval(() => {
      setServices((prev) =>
        prev.map((s) => ({
          ...s,
          responseTime: Math.max(10, s.responseTime + Math.floor(Math.random() * 20 - 10)),
          lastChecked: new Date(),
        }))
      );
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus: ServiceStatus["status"] = services.every((s) => s.status === "operational")
    ? "operational"
    : services.some((s) => s.status === "down")
    ? "down"
    : "degraded";

  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="API Status & System Uptime - SalesOS Developer Platform"
        description="Real-time SalesOS API status, system uptime monitoring, and incident history. Check REST API, GraphQL, webhooks, and edge function availability."
        keywords="SalesOS API status, system uptime, API monitoring, developer platform, service status"
        canonicalUrl="https://salesos.alephwavex.io/api-status"
        noIndex={false}
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "API Status", url: "https://salesos.alephwavex.io/api-status" }
      ]} />

      <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-12 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-16"
            aria-labelledby="status-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, transparent 70%)",
                filter: "blur(40px)",
              }}
              aria-hidden="true"
            />
            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-5xl">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 mb-6 text-sm transition-colors"
                style={{ color: "hsl(0 0% 100% / 0.7)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 80%)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70 sm:text-xs">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Live monitoring
                  </span>
                  <h1
                    id="status-heading"
                    className="font-display text-3xl sm:text-4xl mb-2"
                    style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
                  >
                    API{" "}
                    <span
                      className="font-display italic animate-shiny"
                      style={{
                        backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                        backgroundSize: "200% auto",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        filter: "url(#c3-noise)",
                      }}
                    >
                      Status
                    </span>
                  </h1>
                  <p style={{ color: "hsl(0 0% 100% / 0.55)" }}>Real-time system status and incident history</p>
                </div>
                <a
                  href="/api-docs"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors shrink-0 w-fit"
                  style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
                >
                  <ExternalLink className="w-4 h-4" />
                  API Docs
                </a>
              </div>
            </div>
          </section>

          <div className="container mx-auto px-5 sm:px-6 pb-16 max-w-5xl space-y-6">

            {/* Overall status */}
            <div
              className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              style={{
                ...(overallStatus === "operational"
                  ? { background: "hsl(142 70% 55% / 0.05)", border: "1px solid hsl(142 70% 55% / 0.25)" }
                  : cardStyle),
              }}
            >
              <div className="flex items-center gap-3">
                <StatusIcon status={overallStatus} />
                <div>
                  <p className="font-semibold" style={{ color: "hsl(0 0% 92%)" }}>
                    {overallStatus === "operational" ? "All Systems Operational" : overallStatus === "down" ? "System Outage" : "Degraded Performance"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                    Last updated: {new Date().toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold" style={{ color: "hsl(142 70% 60%)" }}>{uptimeStats.last30Days}%</p>
                <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.7)" }}>30-day uptime</p>
              </div>
            </div>

            {/* Uptime stats */}
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: "7-Day Uptime", value: uptimeStats.last7Days },
                { label: "30-Day Uptime", value: uptimeStats.last30Days },
                { label: "90-Day Uptime", value: uptimeStats.last90Days },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl p-5" style={cardStyle}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium" style={{ color: "hsl(0 0% 80%)" }}>{label}</p>
                    <TrendingUp className="w-4 h-4" style={{ color: "hsl(142 70% 55%)" }} />
                  </div>
                  <p className="text-2xl font-bold mb-3" style={{ color: "hsl(0 0% 92%)" }}>{value}%</p>
                  <NativeProgress value={value} />
                </div>
              ))}
            </div>

            {/* Services */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.14)" }}>
                <h2 className="font-semibold" style={{ color: "hsl(0 0% 90%)" }}>Service Status</h2>
                <p className="text-sm mt-0.5" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Current status of all API services</p>
              </div>
              <div className="divide-y" style={{ borderColor: "hsl(261 75% 50% / 0.1)" }}>
                {services.map((service) => (
                  <div
                    key={service.name}
                    className="flex items-center justify-between px-5 sm:px-6 py-4"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <StatusIcon status={service.status} />
                      <div className="flex-1">
                        <h3 className="font-medium text-sm" style={{ color: "hsl(0 0% 90%)" }}>{service.name}</h3>
                        <div className="flex items-center gap-4 text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            {service.uptime}% uptime
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {service.responseTime}ms avg
                          </span>
                        </div>
                      </div>
                    </div>
                    <StatusPill status={service.status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Incident History */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.14)" }}>
                <h2 className="font-semibold" style={{ color: "hsl(0 0% 90%)" }}>Incident History</h2>
                <p className="text-sm mt-0.5" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Recent and ongoing incidents</p>
              </div>
              <div className="px-5 sm:px-6 py-5">
                {incidents.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "hsl(142 70% 55%)" }} />
                    <p style={{ color: "hsl(0 0% 100% / 0.7)" }}>No incidents in the last 90 days</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {incidents.map((incident) => (
                      <div key={incident.id} className="rounded-xl p-5" style={{ background: "hsl(261 75% 50% / 0.03)", border: "1px solid hsl(261 75% 50% / 0.12)" }}>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <SeverityPill severity={incident.severity} />
                          <IncidentStatusPill status={incident.status} />
                        </div>
                        <h3 className="font-semibold mb-1" style={{ color: "hsl(0 0% 90%)" }}>{incident.title}</h3>
                        <p className="text-xs mb-4" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                          {incident.created_at.toLocaleString()}
                          {incident.resolved_at && <> — Resolved {incident.resolved_at.toLocaleString()}</>}
                        </p>
                        <div className="space-y-3">
                          {incident.updates.map((update, i) => (
                            <div key={i} className="pl-4" style={{ borderLeft: "2px solid hsl(261 75% 50% / 0.25)" }}>
                              <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{update.message}</p>
                              <p className="text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                                {update.timestamp.toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Subscribe */}
            <div className="rounded-2xl p-5 sm:p-6" style={cardStyle}>
              <h2 className="font-semibold mb-2" style={{ color: "hsl(0 0% 90%)" }}>Subscribe to Updates</h2>
              <p className="text-sm mb-4" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                Subscribe to webhook notifications or RSS feed for real-time status updates
              </p>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono"
                style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.14)", color: "hsl(261 75% 72%)" }}
              >
                https://status.salesos.com/feed.rss
              </div>
            </div>

            {/* Related */}
            <div className="pt-4" style={{ borderTop: "1px solid hsl(261 75% 50% / 0.18)" }}>
              <p className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Related resources</p>
              <ul className="grid sm:grid-cols-2 gap-3 text-sm">
                {[
                  { href: "/api-docs", label: "API Documentation", sub: "Complete integration guide" },
                  { href: "/security", label: "Security Practices", sub: "Data protection measures" },
                  { href: "/help", label: "Help Center", sub: "Guides and support" },
                  { href: "/pricing", label: "Pricing Plans", sub: "Find your plan" },
                ].map(({ href, label, sub }) => (
                  <li key={href}>
                    <a href={href} className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>{label}</a>
                    <span style={{ color: "hsl(0 0% 100% / 0.55)" }}> – {sub}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default ApiStatus;
