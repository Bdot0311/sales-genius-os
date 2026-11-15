import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState, Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useVisitorIntelligence } from "@/hooks/use-visitor-intelligence";

interface SiteRow {
  id: string;
  name: string;
  allowed_domains: string[];
  verified_hosts: string[];
  consent_mode: string;
  excluded_paths: string[];
  excluded_ips: string[];
  retention_days: number;
  enabled: boolean;
}

interface MatchRow {
  id: string;
  status: string;
  classification: string;
  company_name: string | null;
  company_domain: string | null;
  confidence: number | null;
  unknown_reason: string | null;
  last_seen: string;
  evidence: { source?: string; detail?: string }[] | null;
}

interface EventRow {
  id: string;
  event_name: string;
  path: string;
  page_type: string;
  referrer_host: string | null;
  is_returning: boolean;
  is_test: boolean;
  received_at: string;
  visitor_key: string;
  session_id: string;
}

interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  page_types: string[];
  min_confidence: number;
  actions: string[];
  daily_cap: number;
  sequence_id: string | null;
}

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

const Visitors = () => {
  const { enabled, loading } = useVisitorIntelligence();
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [pageViews, setPageViews] = useState<number | null>(null);
  const [identified, setIdentified] = useState<number | null>(null);
  const [unknown, setUnknown] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [siteRes, matchRes, eventRes, ruleRes, viewRes, identifiedRes, unknownRes] = await Promise.all([
      supabase.from("visitor_sites").select("id, name, allowed_domains, verified_hosts, consent_mode, excluded_paths, excluded_ips, retention_days, enabled").order("created_at", { ascending: false }),
      supabase.from("visitor_company_matches").select("id, status, classification, company_name, company_domain, confidence, unknown_reason, last_seen, evidence").order("last_seen", { ascending: false }).limit(100),
      supabase.from("visitor_events").select("id, event_name, path, page_type, referrer_host, is_returning, is_test, received_at, visitor_key, session_id").order("received_at", { ascending: false }).limit(100),
      supabase.from("visitor_rules").select("id, name, enabled, page_types, min_confidence, actions, daily_cap, sequence_id").order("created_at", { ascending: false }),
      supabase.from("visitor_events").select("id", { count: "exact", head: true }).eq("event_name", "page_view"),
      supabase.from("visitor_company_matches").select("id", { count: "exact", head: true }).eq("status", "matched"),
      supabase.from("visitor_company_matches").select("id", { count: "exact", head: true }).eq("status", "unknown"),
    ]);
    const firstError = siteRes.error || matchRes.error || eventRes.error || ruleRes.error || viewRes.error || identifiedRes.error || unknownRes.error;
    setError(firstError ? firstError.message : null);
    setSites(siteRes.data ?? []);
    setMatches((matchRes.data ?? []) as MatchRow[]);
    setEvents(eventRes.data ?? []);
    setRules(ruleRes.data ?? []);
    setPageViews(viewRes.count ?? 0);
    setIdentified(identifiedRes.count ?? 0);
    setUnknown(unknownRes.count ?? 0);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Visitors"
        description="Company-level website visits. A visitor with no confident match stays Unknown."
      />
      <div className="px-4 py-4 sm:px-6">
        {loading ? <p className="text-sm text-muted-foreground">Checking access…</p> : null}
        {!loading && !enabled ? (
          <EmptyState
            title="Visitor Intelligence is off for this workspace"
            body="An admin has to turn on the visitorIntelligence flag and grant this workspace. Until then nothing is collected here."
          />
        ) : null}
        {enabled ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="rules">Automation rules</TabsTrigger>
              <TabsTrigger value="install">Installation & settings</TabsTrigger>
            </TabsList>
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
            <TabsContent value="overview"><Overview pageViews={pageViews} identified={identified} unknown={unknown} events={events} onInstall={() => setTab("install")} /></TabsContent>
            <TabsContent value="companies"><Companies matches={matches} onChanged={load} /></TabsContent>
            <TabsContent value="activity"><Activity events={events} matches={matches} /></TabsContent>
            <TabsContent value="rules"><Rules sites={sites} rules={rules} onChanged={load} /></TabsContent>
            <TabsContent value="install"><Install sites={sites} onChanged={load} /></TabsContent>
          </Tabs>
        ) : null}
      </div>
    </DashboardLayout>
  );
};

function Overview({ pageViews, identified, unknown, events, onInstall }: { pageViews: number | null; identified: number | null; unknown: number | null; events: EventRow[] | null; onInstall: () => void }) {
  if (!events || pageViews == null || identified == null || unknown == null) return <p className="text-sm text-muted-foreground">Loading visits…</p>;
  if (pageViews === 0 && identified === 0 && unknown === 0) {
    return <EmptyState title="No visits yet" body="Install the snippet on a site you own. Counts appear after a real page view is stored." action={<Button onClick={onInstall}>Installation</Button>} />;
  }
  const sessions = new Set(events.map((row) => row.session_id)).size;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Page views" value={String(pageViews)} note="Stored page_view events" />
      <Metric label="Identified companies" value={String(identified)} note="Matches with a named company" />
      <Metric label="Unknown" value={String(unknown)} note="No confident company" />
      <Metric label="Sessions shown" value={String(sessions)} note={events.length === 100 ? "Distinct sessions in the latest 100 events" : "Distinct sessions in the loaded events"} />
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Panel>
      <PanelBody>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </PanelBody>
    </Panel>
  );
}

function Companies({ matches, onChanged }: { matches: MatchRow[] | null; onChanged: () => Promise<void> }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [people, setPeople] = useState<{ name: string; title: string | null; domain: string }[]>([]);
  if (!matches) return null;
  if (matches.length === 0) return <EmptyState title="No companies resolved" body="Resolution runs after a visit. Home, mobile, cloud and VPN networks stay Unknown." />;
  const search = async (domain: string) => {
    setNotice(null);
    const { data, error } = await supabase.functions.invoke("search-companies", { body: { query: domain } });
    if (error) { setNotice(error.message); return; }
    const companies = Array.isArray(data?.companies) ? data.companies : [];
    setNotice(companies.length ? companies.map((company: { name?: string; domain?: string }) => `${company.name ?? "Unnamed"} · ${company.domain ?? ""}`).join("\n") : "Company search returned nothing.");
  };
  const findPeople = async (domain: string) => {
    setNotice("Searching people with this workspace's credits…");
    const { data, error } = await supabase.functions.invoke("fetch-external-leads", { body: { company_domain: domain, limit: 5 } });
    if (error || data?.error) { setNotice(error?.message ?? data?.error); setPeople([]); return; }
    const rows = (Array.isArray(data?.leads) ? data.leads : []).map((lead: { contact_name?: string; job_title?: string; company_domain?: string }) => ({
      name: lead.contact_name || "",
      title: lead.job_title ?? null,
      domain: lead.company_domain || domain,
    })).filter((lead: { name: string }) => lead.name);
    setPeople(rows);
    setNotice(rows.length ? null : "People search returned nobody with a name.");
  };
  const save = async (person: { name: string; title: string | null; domain: string }, company: string) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data: lead, error } = await supabase.from("leads").insert({
      user_id: user.user.id,
      company_name: company,
      company_website: `https://${person.domain}`,
      contact_name: person.name,
      job_title: person.title,
      source: "visitor_intelligence",
      lead_status: "active",
    }).select("id").single();
    if (error || !lead) { setNotice(error?.message ?? "Could not save."); return; }
    await supabase.functions.invoke("enrich-lead", { body: { leadId: lead.id } });
    setNotice(`Saved ${person.name}. Enrichment was requested through the existing enrich path.`);
    await onChanged();
  };
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="py-2 pr-3">Company</th><th className="py-2 pr-3">Confidence</th><th className="py-2 pr-3">Why</th><th className="py-2">Actions</th></tr>
          </thead>
          <tbody>
            {matches.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="py-3 pr-3">
                  <p className="font-medium">{row.status === "matched" ? row.company_name : "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{row.company_domain || row.classification}</p>
                </td>
                <td className="py-3 pr-3 tabular-nums">{row.status === "matched" && row.confidence != null ? row.confidence : "—"}</td>
                <td className="py-3 pr-3 text-xs text-muted-foreground">{row.status === "unknown" ? row.unknown_reason : (row.evidence ?? []).map((item) => item.detail).filter(Boolean).join(" · ")}</td>
                <td className="py-3">
                  {row.company_domain ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button size="sm" variant="outline" onClick={() => void search(row.company_domain!)}>Company search</Button>
                      <Button size="sm" variant="outline" onClick={() => void findPeople(row.company_domain!)}>Find people</Button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">No domain to search</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notice ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notice}</p> : null}
      {people.length > 0 ? (
        <Panel>
          <PanelHeader><PanelTitle>People search</PanelTitle><PanelDescription>Names returned by the existing people search. Nothing is saved until you save one.</PanelDescription></PanelHeader>
          <PanelBody className="space-y-2">
            {people.map((person) => (
              <div key={`${person.name}-${person.title}`} className="flex flex-col gap-2 border-b border-border py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">{person.name}{person.title ? ` · ${person.title}` : ""}</span>
                <Button size="sm" onClick={() => void save(person, matches.find((row) => row.company_domain === person.domain)?.company_name || person.domain)}>Save & enrich</Button>
              </div>
            ))}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

function Activity({ events }: { events: EventRow[] | null; matches: MatchRow[] | null }) {
  if (!events) return null;
  if (events.length === 0) return <EmptyState title="No activity" body="Page views and custom events show up here after the snippet sends them." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Path</th><th className="py-2">Referrer</th></tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-border">
              <td className="py-2 pr-3 whitespace-nowrap text-xs">{new Date(event.received_at).toLocaleString()}</td>
              <td className="py-2 pr-3">{event.event_name}{event.is_test ? " · test" : ""}{event.is_returning ? " · returning" : ""}</td>
              <td className="py-2 pr-3">{event.path} <span className="text-xs text-muted-foreground">({event.page_type})</span></td>
              <td className="py-2 text-xs text-muted-foreground">{event.referrer_host || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rules({ sites, rules, onChanged }: { sites: SiteRow[] | null; rules: RuleRow[] | null; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("Pricing visit");
  const [pageType, setPageType] = useState("pricing");
  const [confidence, setConfidence] = useState("0.7");
  const [cap, setCap] = useState("5");
  const [message, setMessage] = useState<string | null>(null);
  if (!sites || !rules) return null;
  if (sites.length === 0) return <EmptyState title="Create a site first" body="Rules belong to a site. Add one under Installation & settings." />;
  const create = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const min = Number(confidence);
    const { error } = await supabase.from("visitor_rules").insert({
      user_id: user.user.id,
      site_id: sites[0].id,
      name: name.trim() || "Visitor rule",
      enabled: false,
      page_types: [pageType],
      event_names: ["page_view"],
      min_confidence: Number.isFinite(min) ? Math.min(0.9, Math.max(0.5, min)) : 0.7,
      actions: ["find_contacts", "enrich", "draft"],
      daily_cap: Math.min(25, Math.max(1, Math.round(Number(cap) || 5))),
    });
    setMessage(error ? error.message : "Rule saved, off. Turn it on when you want it to run. It drafts for approval and does not send.");
    await onChanged();
  };
  const toggle = async (rule: RuleRow, enabled: boolean) => {
    await supabase.from("visitor_rules").update({ enabled }).eq("id", rule.id);
    await onChanged();
  };
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>
          <PanelTitle>New rule</PanelTitle>
          <PanelDescription>Example: a pricing page visit from a matched company at or above a confidence. The rule finds contacts, enriches, and drafts. Enrollment from automation stays paused.</PanelDescription>
        </PanelHeader>
        <PanelBody className="grid gap-3 sm:grid-cols-2">
          <Label className="space-y-1">Name<Input value={name} onChange={(event) => setName(event.target.value)} /></Label>
          <Label className="space-y-1">Page type
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={pageType} onChange={(event) => setPageType(event.target.value)}>
              {["pricing", "product", "integrations", "demo", "home", "other"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Label>
          <Label className="space-y-1">Minimum confidence<Input value={confidence} onChange={(event) => setConfidence(event.target.value)} /></Label>
          <Label className="space-y-1">Daily cap (max 25)<Input value={cap} onChange={(event) => setCap(event.target.value)} /></Label>
          <Button className="sm:col-span-2 w-fit" onClick={() => void create()}>Save rule</Button>
          {message ? <p className="sm:col-span-2 text-sm text-muted-foreground">{message}</p> : null}
        </PanelBody>
      </Panel>
      {rules.length === 0 ? <EmptyState title="No rules" body="Nothing runs until you save one and turn it on." /> : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{rule.name}</p>
                <p className="text-xs text-muted-foreground">{rule.page_types.join(", ") || "any page"} · confidence {rule.min_confidence} · cap {rule.daily_cap} · {rule.actions.join(", ")}</p>
              </div>
              <Switch checked={rule.enabled} onCheckedChange={(checked) => void toggle(rule, checked)} aria-label={`Toggle ${rule.name}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Install({ sites, onChanged }: { sites: SiteRow[] | null; onChanged: () => Promise<void> }) {
  const site = sites?.[0] ?? null;
  const [name, setName] = useState(site?.name ?? "Website");
  const [domains, setDomains] = useState((site?.allowed_domains ?? []).join("\n"));
  const [paths, setPaths] = useState((site?.excluded_paths ?? []).join("\n"));
  const [ips, setIps] = useState((site?.excluded_ips ?? []).join("\n"));
  const [consent, setConsent] = useState(site?.consent_mode !== "not_required");
  const [retention, setRetention] = useState(String(site?.retention_days ?? 90));
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  useEffect(() => {
    if (!site) return;
    setName(site.name);
    setDomains(site.allowed_domains.join("\n"));
    setPaths(site.excluded_paths.join("\n"));
    setIps(site.excluded_ips.join("\n"));
    setConsent(site.consent_mode !== "not_required");
    setRetention(String(site.retention_days));
  }, [site?.id]);
  if (!sites) return null;
  const save = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const row = {
      name: name.trim() || "Website",
      allowed_domains: lines(domains),
      excluded_paths: lines(paths),
      excluded_ips: lines(ips),
      consent_mode: consent ? "required" : "not_required",
      retention_days: Math.min(365, Math.max(7, Math.round(Number(retention) || 90))),
    };
    const write = site
      ? supabase.from("visitor_sites").update(row).eq("id", site.id)
      : supabase.from("visitor_sites").insert({ ...row, user_id: user.user.id });
    const { error } = await write;
    setMessage(error ? error.message : "Saved.");
    await onChanged();
  };
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/visitor-ingest`;
  const scriptUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/visitor-sdk`;
  const appScript = `${window.location.origin}/v.js`;
  const snippet = site ? `<script async src="${appScript}" data-site-id="${site.id}" data-consent="${consent ? "required" : "not_required"}" data-endpoint="${endpoint}"></script>` : "";
  const sendTest = async () => {
    if (!site) return;
    setTestResult("Sending…");
    const { data, error } = await supabase.functions.invoke("visitor-ingest", {
      body: {
        site_id: site.id,
        test: true,
        consent: true,
        events: [{
          event_id: crypto.randomUUID(),
          event_name: "page_view",
          path: "/pricing?utm_source=test&token=should-not-store",
          session_id: crypto.randomUUID(),
          visitor_key: crypto.randomUUID(),
          returning: false,
        }],
      },
    });
    setTestResult(error ? error.message : JSON.stringify(data));
    await onChanged();
  };
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>
          <PanelTitle>Site</PanelTitle>
          <PanelDescription>The site id is public. Allowed domains are what stop other origins from writing events. Raw IP addresses are kept at most 24 hours on the resolve job, then dropped. Events are kept for the retention window below.</PanelDescription>
        </PanelHeader>
        <PanelBody className="grid gap-3">
          <Label className="space-y-1">Name<Input value={name} onChange={(event) => setName(event.target.value)} /></Label>
          <Label className="space-y-1">Allowed domains, one per line<Textarea value={domains} onChange={(event) => setDomains(event.target.value)} placeholder={"outreign.io\nwww.outreign.io"} /></Label>
          <Label className="space-y-1">Excluded paths<Textarea value={paths} onChange={(event) => setPaths(event.target.value)} placeholder={"/admin\n/checkout"} /></Label>
          <Label className="space-y-1">Excluded IPs or CIDRs<Textarea value={ips} onChange={(event) => setIps(event.target.value)} placeholder={"203.0.113.8\n203.0.113.0/24"} /></Label>
          <Label className="space-y-1">Retention days (7–365)<Input value={retention} onChange={(event) => setRetention(event.target.value)} /></Label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Require consent before collecting</span>
            <Switch checked={consent} onCheckedChange={setConsent} aria-label="Require consent" />
          </div>
          <Button className="w-fit" onClick={() => void save()}>{site ? "Save settings" : "Create site"}</Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {site ? <p className="text-xs text-muted-foreground">Verified hosts: {site.verified_hosts.length ? site.verified_hosts.join(", ") : "none yet — a real visit from an allowed domain marks it."}</p> : null}
        </PanelBody>
      </Panel>
      {site ? (
        <Panel>
          <PanelHeader>
            <PanelTitle>Snippet</PanelTitle>
            <PanelDescription>Served by this app at /v.js and by the visitor-sdk function. A cdn.outreign.io host is optional and is not configured. The script calls OutReign.track(name, props), OutReign.consent() and OutReign.disable().</PanelDescription>
          </PanelHeader>
          <PanelBody className="space-y-3">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{snippet}</pre>
            <p className="text-xs text-muted-foreground">Function URL for the script: {scriptUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void navigator.clipboard.writeText(snippet)}>Copy snippet</Button>
              <Button variant="outline" onClick={() => void sendTest()}>Send test event</Button>
            </div>
            {testResult ? <p className="text-sm text-muted-foreground">{testResult}</p> : null}
            <p className="text-xs text-muted-foreground">Identification uses reverse DNS, RDAP and ASN data. It does not use a visitor-ID vendor. Residential, mobile, cloud and VPN ranges stay Unknown. A company network is only named when the signals agree, and even then coverage is partial.</p>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

export default Visitors;
