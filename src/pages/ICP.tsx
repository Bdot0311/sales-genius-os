import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useICPProfiles, ICPProfile } from "@/hooks/use-icp-profiles";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Plus, Trash2, X, Save, Building2, Users, Activity, Ban, Lightbulb, Sparkles, BarChart3, Search } from "lucide-react";
import { toast } from "sonner";
import { ICPLookalikesDialog } from "@/components/dashboard/ICPLookalikesDialog";
import { ICPValidationPanel } from "@/components/dashboard/ICPValidationPanel";
import { IcpVersionHistory } from "@/components/dashboard/IcpVersionHistory";

// ─── Option catalogs ─────────────────────────────────────────────────────────
const INDUSTRY_OPTIONS = [
  "SaaS", "B2B Software", "AI / ML", "Cybersecurity", "Fintech", "Insurtech", "Healthtech", "Biotech",
  "E-commerce", "DTC / Consumer Brands", "Marketplaces", "Retail", "Hospitality", "Real Estate",
  "Construction", "Manufacturing", "Logistics & Supply Chain", "Transportation", "Legal", "Accounting",
  "Consulting", "Marketing Agency", "Creative Agency", "Recruiting / Staffing", "Education / EdTech",
  "Nonprofit", "Government", "Energy / Cleantech", "Media & Entertainment", "Gaming", "Crypto / Web3",
  "Telecom", "Automotive", "Aerospace & Defense", "Pharma", "Other",
];
const GEO_OPTIONS = ["US", "Canada", "UK", "Western Europe", "Eastern Europe", "Nordics", "DACH", "MENA", "LATAM", "APAC", "ANZ", "India", "Global"];
const REVENUE_OPTIONS = ["Pre-revenue", "<$1M", "$1M–$10M", "$10M–$50M", "$50M–$250M", "$250M–$1B", "$1B+"];
const BUSINESS_MODELS = ["B2B SaaS", "B2C", "B2B2C", "Marketplace", "Enterprise / On-prem", "Services / Agency", "Hardware", "Hybrid"];
const FUNDING_STAGES = ["Bootstrapped", "Pre-seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Public", "PE-backed", "Acquired"];
const GROWTH_STAGES = ["Idea / Stealth", "Early Traction", "Product-Market Fit", "Scaling", "Mature", "Decline / Turnaround"];
const COMPANY_AGE = ["<1 year", "1–3 years", "3–7 years", "7–15 years", "15+ years"];
const DEAL_SIZES = ["<$1K", "$1K–$10K", "$10K–$50K", "$50K–$250K", "$250K–$1M", "$1M+"];
const SALES_CYCLES = ["Self-serve / PLG", "<2 weeks", "2–4 weeks", "1–3 months", "3–6 months", "6+ months"];
const BUDGET_AUTHORITY = ["Individual contributor", "Manager (signs <$10K)", "Director (signs <$50K)", "VP (signs <$250K)", "C-Level (any)", "Procurement / Committee"];
const DEPARTMENTS = ["Sales", "Marketing", "Revenue Operations", "Customer Success", "Engineering", "Product", "Design", "Data / Analytics", "Finance", "Operations", "HR / People", "Legal", "IT / Security", "Founders / Exec"];
const SENIORITY = ["Individual Contributor", "Senior IC", "Team Lead", "Manager", "Senior Manager", "Director", "Senior Director", "VP", "SVP", "C-Level", "Founder / Owner"];
const CHANNELS = ["Cold Email", "LinkedIn DM", "Cold Call", "Warm Intro", "Events / Conferences", "Webinars", "Paid Ads", "SEO / Content", "Direct Mail", "Community / Slack"];

const SIGNAL_OPTIONS = [
  "Recently raised funding", "Hiring sales roles", "Hiring engineering at scale", "Hiring RevOps / SalesOps",
  "Leadership change (new CRO/CMO/CEO)", "Product launch / major release", "Expanding to new geography",
  "Tech stack change", "M&A activity", "Layoffs / cost-cutting", "Press / media mention",
  "Posted on social about a pain point", "Job posting mentions your category", "Slow website / poor reviews",
  "Compliance deadline approaching", "Switched competitor in last 90 days",
];

const HIRING_SIGNAL_OPTIONS = [
  "Hiring SDRs / BDRs", "Hiring AEs", "Hiring Head of Sales / VP Sales", "Hiring RevOps",
  "Hiring Marketing Ops", "Hiring Customer Success", "Hiring Engineers (scaling)",
  "Hiring Data team", "Hiring Founding [role]", "Hiring Security / Compliance",
];

const SECTION_ICONS = {
  basics: Target,
  firmographics: Building2,
  people: Users,
  signals: Activity,
  exclusions: Ban,
  strategy: Lightbulb,
  scoring: BarChart3,
};

const emptyProfile: Partial<ICPProfile> = {
  name: "", industries: [], company_size_min: 1, company_size_max: 10000,
  revenue_range: [], geographies: [], target_titles: [], tech_stack: [],
  buying_signals: [], pain_points: [], disqualifiers: null, notes: null,
  business_model: [], funding_stages: [], growth_stage: [], company_age_range: [],
  deal_size_range: [], sales_cycle: [],
  departments: [], seniority_levels: [], budget_authority: [],
  event_triggers: [], intent_keywords: [], hiring_signals: [], competitor_tools: [],
  exclude_industries: [], exclude_titles: [], exclude_keywords: [],
  exclude_headcount_ceiling: null, exclude_b2c: false, exclude_regulated: [], exclude_non_english: false,
  value_proposition: null, use_cases: [], objections: [], success_metrics: [],
  preferred_channels: [], customer_examples: null,
  scoring_weights: { title: 25, industry: 25, size: 25, tech: 25 },
};

function TagInput({ value, onChange, placeholder, suggestions }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[] }) {
  const [input, setInput] = useState("");
  const filteredSuggestions = suggestions?.filter(s => !value.includes(s) && (input.length === 0 || s.toLowerCase().includes(input.toLowerCase()))).slice(0, 6);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 text-xs">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))}><X className="w-3 h-3" /></button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            if (!value.includes(input.trim())) onChange([...value, input.trim()]);
            setInput("");
          }
        }}
      />
      {filteredSuggestions && filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {filteredSuggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange([...value, s]); setInput(""); }}
              className="text-xs px-2 py-0.5 rounded-full bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Badge
          key={opt}
          variant={value.includes(opt) ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])}
        >
          {opt}
        </Badge>
      ))}
    </div>
  );
}

function ListInput({ value, onChange, placeholder, maxItems = 10 }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; maxItems?: number }) {
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      {value.length < maxItems && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ""])}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      )}
    </div>
  );
}

function getCompletionScore(p: Partial<ICPProfile>): number {
  const fields = [
    p.name,
    (p.industries || []).length > 0,
    p.company_size_min !== undefined,
    (p.revenue_range || []).length > 0,
    (p.geographies || []).length > 0,
    (p.target_titles || []).length > 0,
    (p.tech_stack || []).length > 0,
    (p.buying_signals || []).length > 0,
    (p.pain_points || []).length > 0,
    p.disqualifiers,
    (p.business_model || []).length > 0,
    (p.departments || []).length > 0,
    (p.seniority_levels || []).length > 0,
    p.value_proposition,
    (p.use_cases || []).length > 0,
    (p.deal_size_range || []).length > 0,
    (p.preferred_channels || []).length > 0,
    p.customer_examples,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

const ICP = () => {
  const { profiles, isLoading, error: profilesError, createProfile, updateProfile, deleteProfile } = useICPProfiles();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, gatedAction, features, loading: planLoading } = usePlanFeatures();
  const [editing, setEditing] = useState<Partial<ICPProfile> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [lookalikeProfile, setLookalikeProfile] = useState<ICPProfile | null>(null);

  const icpGated = !hasFeature('icpBuilder');
  const lookalikeGated = !hasFeature('icpLookalike');

  const openLookalikes = (p: ICPProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (lookalikeGated) { gatedAction('icpLookalike', () => {}); return; }
    setLookalikeProfile(p);
  };

  const openNew = () => {
    if (planLoading) return;
    if (icpGated) { gatedAction('icpBuilder', () => {}); return; }
    const limit = features.icpProfiles as number;
    if (limit !== -1 && profiles.length >= limit) { gatedAction('higherLimits', () => {}); return; }
    setEditing({ ...emptyProfile });
    setIsNew(true);
  };

  const openEdit = (p: ICPProfile) => {
    if (icpGated) { gatedAction('icpBuilder', () => {}); return; }
    setEditing({ ...p });
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!editing?.name?.trim()) { toast.error("Profile name is required"); return; }
    if (isNew) await createProfile.mutateAsync(editing);
    else if (editing?.id) await updateProfile.mutateAsync({ id: editing.id, ...editing } as any);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await deleteProfile.mutateAsync(id);
  };

  const update = (patch: Partial<ICPProfile>) => setEditing((e) => e ? { ...e, ...patch } : e);

  return (
    <DashboardLayout>
      <PageHeader
        title="Ideal Customer Profiles"
        description="Define exactly who you sell to — across firmographics, people, signals, and strategy."
        actions={
          <Button size="sm" onClick={openNew} disabled={planLoading}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />New ICP
          </Button>
        }
      />
      <div className="space-y-4 pt-4">
        {profilesError && (
          <Panel>
            <PanelBody className="py-3.5">
              <p className="text-[0.8125rem] font-medium text-destructive">Could not load your ICPs</p>
              <p className="mt-1 break-words text-[0.6875rem] leading-relaxed text-muted-foreground">
                {(profilesError as any)?.message ?? String(profilesError)}
              </p>
            </PanelBody>
          </Panel>
        )}

        {isLoading ? (
          <Panel>
            <PanelBody className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </PanelBody>
          </Panel>
        ) : !profilesError && profiles.length === 0 ? (
          <EmptyState
            title="No ICPs yet"
            body="An ICP describes who you sell to across seven dimensions — firmographics, personas, signals, exclusions, strategy and your own scoring weights — and every search and score reads from it."
            action={
              <Button size="sm" onClick={openNew} disabled={planLoading}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />Create the first one
              </Button>
            }
          />
        ) : (
          /*
            A list, not a grid of cards.
            Each ICP was a card carrying a coloured completion badge, a row of
            filled badges for industries, a row of outlined badges for titles,
            and a full-width outlined button — so the heaviest element on the
            page was repeated once per profile, three badge variants appeared on
            one card, and the whole card was clickable with a button inside it.
            Rows compare down a column, which is what you do with a set of ICPs,
            and they still read at ten profiles where the grid did not.
          */
          <Panel>
            <PanelHeader
              title="Your ICPs"
              meta={`${profiles.length} ${profiles.length === 1 ? "profile" : "profiles"}`}
            />
            <div>
              {profiles.map((p) => {
                const score = getCompletionScore(p);
                const targets = [
                  p.industries.length > 0 ? p.industries.slice(0, 3).join(", ") : null,
                  p.industries.length > 3 ? `+${p.industries.length - 3} more industries` : null,
                  `${p.company_size_min}–${p.company_size_max} employees`,
                  p.business_model?.length ? p.business_model.join(", ") : null,
                  p.deal_size_range?.length ? `${p.deal_size_range.join(", ")} ACV` : null,
                ].filter(Boolean) as string[];
                const people =
                  p.target_titles.length > 0
                    ? p.target_titles.slice(0, 4).join(", ") +
                      (p.target_titles.length > 4 ? ` +${p.target_titles.length - 4}` : "")
                    : null;

                return (
                  <div
                    key={p.id}
                    className="group border-b border-border/30 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/20 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[0.8125rem] font-medium text-foreground">
                          {p.name}
                        </span>
                        {p.value_proposition && (
                          <span className="mt-1 line-clamp-2 block max-w-[70ch] text-[0.6875rem] leading-relaxed text-muted-foreground">
                            {p.value_proposition}
                          </span>
                        )}
                      </button>

                      {/* Completion as a measure rather than a traffic light.
                          A red, amber or green badge says "bad / medium / good"
                          about a profile that is simply unfinished, and the
                          three colours carry no more information than the
                          number does. Colour appears only low enough down that
                          the searches reading this ICP will be poor. */}
                      <div className="flex shrink-0 items-center gap-2.5">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${score >= 40 ? "bg-primary" : "bg-amber-500"}`}
                            style={{ width: `${Math.max(4, score)}%` }}
                          />
                        </div>
                        <span className="w-16 text-[0.625rem] tabular-nums text-muted-foreground">
                          {score}% filled
                        </span>
                        <button
                          type="button"
                          onClick={(e) => openLookalikes(p, e)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.6875rem] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          <Search className="h-3.5 w-3.5" />
                          Lookalikes
                        </button>
                      </div>
                    </div>

                    {/* Plain text, not badge soup. Six pills on a row is six
                        borders and six backgrounds to say what a sentence says
                        in one. */}
                    {(targets.length > 0 || people) && (
                      <dl className="mt-2 space-y-1">
                        {targets.length > 0 && (
                          <div className="flex gap-2 text-[0.6875rem] leading-relaxed">
                            <dt className="w-14 shrink-0 text-muted-foreground/60">Companies</dt>
                            <dd className="min-w-0 text-muted-foreground">{targets.join(" · ")}</dd>
                          </div>
                        )}
                        {people && (
                          <div className="flex gap-2 text-[0.6875rem] leading-relaxed">
                            <dt className="w-14 shrink-0 text-muted-foreground/60">People</dt>
                            <dd className="min-w-0 text-muted-foreground">{people}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </div>

      {/* Advanced Editor Sheet */}
      <Sheet open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {isNew ? "New ICP Profile" : "Edit ICP Profile"}
            </SheetTitle>
            <SheetDescription>The most detailed ICP builder in outbound — fill what matters, skip what doesn't.</SheetDescription>
          </SheetHeader>

          {editing && (
            <div className="mt-6">
              <div className="mb-4 space-y-3">
                <ICPValidationPanel profile={editing as any} />
                {editing.id && <IcpVersionHistory icpProfileId={editing.id} />}
              </div>
              <Tabs defaultValue="basics" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4 sm:grid-cols-4">
                  <TabsTrigger value="basics">Basics</TabsTrigger>
                  <TabsTrigger value="targeting">Targeting</TabsTrigger>
                  <TabsTrigger value="signals">Signals</TabsTrigger>
                  <TabsTrigger value="strategy">Strategy</TabsTrigger>
                </TabsList>

                {/* ─── BASICS ──────────────────────────── */}
                <TabsContent value="basics" className="space-y-6">
                  <div className="space-y-2">
                    <Label>Profile Name *</Label>
                    <Input
                      value={editing.name || ""}
                      onChange={(e) => update({ name: e.target.value })}
                      placeholder="e.g., Mid-Market SaaS RevOps Leaders"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Value Proposition (1–2 sentences)</Label>
                    <Textarea
                      value={editing.value_proposition || ""}
                      onChange={(e) => update({ value_proposition: e.target.value })}
                      placeholder="What you uniquely offer this ICP. e.g., 'We help RevOps leaders at $10M–$100M SaaS companies cut their lead enrichment costs by 60% while improving data accuracy.'"
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Example Customers (your best-fit closed-won deals)</Label>
                    <Textarea
                      value={editing.customer_examples || ""}
                      onChange={(e) => update({ customer_examples: e.target.value })}
                      placeholder="List 3–5 of your best customers and what makes them ideal. e.g., 'Acme Corp — 80 employees, Series B, struggling with manual CRM hygiene...'"
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Top Pain Points (the problems you solve)</Label>
                    <ListInput
                      value={editing.pain_points || []}
                      onChange={(v) => update({ pain_points: v })}
                      placeholder="e.g., 'Sales reps waste 4hrs/day on data entry'"
                      maxItems={8}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Use Cases (specific scenarios where they'd use you)</Label>
                    <ListInput
                      value={editing.use_cases || []}
                      onChange={(v) => update({ use_cases: v })}
                      placeholder="e.g., 'Auto-enrich inbound demo requests'"
                      maxItems={8}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Common Objections (what they'll push back on)</Label>
                    <ListInput
                      value={editing.objections || []}
                      onChange={(v) => update({ objections: v })}
                      placeholder="e.g., 'Already using ZoomInfo'"
                      maxItems={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Success Metrics (how they'll measure ROI)</Label>
                    <ListInput
                      value={editing.success_metrics || []}
                      onChange={(v) => update({ success_metrics: v })}
                      placeholder="e.g., 'Pipeline generated per SDR'"
                      maxItems={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      placeholder="Any additional context for this ICP..."
                      value={editing.notes || ""}
                      onChange={(e) => update({ notes: e.target.value })}
                      className="min-h-[80px]"
                    />
                  </div>
                </TabsContent>

                {/* ─── TARGETING ──────────────────────────── */}
                <TabsContent value="targeting" className="space-y-2">
                  <Accordion type="multiple" defaultValue={["firmo", "people"]} className="w-full">
                    <AccordionItem value="firmo">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2"><Building2 className="w-4 h-4" />Firmographics</span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-5 pt-2">
                        <div className="space-y-2">
                          <Label>Industries</Label>
                          <MultiSelect options={INDUSTRY_OPTIONS} value={editing.industries || []} onChange={(v) => update({ industries: v })} />
                          <TagInput
                            value={(editing.industries || []).filter(i => !INDUSTRY_OPTIONS.includes(i))}
                            onChange={(custom) => update({ industries: [...(editing.industries || []).filter(i => INDUSTRY_OPTIONS.includes(i)), ...custom] })}
                            placeholder="Custom industry — press Enter"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Company Size (employees)</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              type="number"
                              min={1}
                              value={editing.company_size_min || ""}
                              onChange={(e) => update({ company_size_min: Math.max(1, parseInt(e.target.value) || 0) })}
                              placeholder="Min"
                              className="w-28"
                            />
                            <span className="text-muted-foreground text-sm">to</span>
                            <Input
                              type="number"
                              min={1}
                              value={editing.company_size_max || ""}
                              onChange={(e) => update({ company_size_max: Math.max(1, parseInt(e.target.value) || 0) })}
                              placeholder="Max"
                              className="w-28"
                            />
                            <span className="text-muted-foreground text-sm">employees</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Annual Revenue</Label>
                            <MultiSelect options={REVENUE_OPTIONS} value={editing.revenue_range || []} onChange={(v) => update({ revenue_range: v })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Business Model</Label>
                            <MultiSelect options={BUSINESS_MODELS} value={editing.business_model || []} onChange={(v) => update({ business_model: v })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Growth Stage</Label>
                            <MultiSelect options={GROWTH_STAGES} value={editing.growth_stage || []} onChange={(v) => update({ growth_stage: v })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Company Age</Label>
                            <MultiSelect options={COMPANY_AGE} value={editing.company_age_range || []} onChange={(v) => update({ company_age_range: v })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Deal Size (ACV)</Label>
                            <MultiSelect options={DEAL_SIZES} value={editing.deal_size_range || []} onChange={(v) => update({ deal_size_range: v })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Sales Cycle</Label>
                            <MultiSelect options={SALES_CYCLES} value={editing.sales_cycle || []} onChange={(v) => update({ sales_cycle: v })} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Funding Stages</Label>
                          <MultiSelect options={FUNDING_STAGES} value={editing.funding_stages || []} onChange={(v) => update({ funding_stages: v })} />
                        </div>

                        <div className="space-y-2">
                          <Label>Geography</Label>
                          <MultiSelect options={GEO_OPTIONS} value={editing.geographies || []} onChange={(v) => update({ geographies: v })} />
                          <TagInput
                            value={(editing.geographies || []).filter(g => !GEO_OPTIONS.includes(g))}
                            onChange={(custom) => update({ geographies: [...(editing.geographies || []).filter(g => GEO_OPTIONS.includes(g)), ...custom] })}
                            placeholder="Specific city / state / country — press Enter"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="people">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2"><Users className="w-4 h-4" />People & Personas</span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-5 pt-2">
                        <div className="space-y-2">
                          <Label>Target Job Titles</Label>
                          <TagInput
                            value={editing.target_titles || []}
                            onChange={(v) => update({ target_titles: v })}
                            placeholder="Type a title and press Enter"
                            suggestions={["VP of Sales", "Head of Growth", "CRO", "CMO", "RevOps Manager", "SDR Manager", "Founder", "CEO", "Director of Demand Gen"]}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Departments</Label>
                          <MultiSelect options={DEPARTMENTS} value={editing.departments || []} onChange={(v) => update({ departments: v })} />
                        </div>

                        <div className="space-y-2">
                          <Label>Seniority Levels</Label>
                          <MultiSelect options={SENIORITY} value={editing.seniority_levels || []} onChange={(v) => update({ seniority_levels: v })} />
                        </div>

                        <div className="space-y-2">
                          <Label>Budget Authority</Label>
                          <MultiSelect options={BUDGET_AUTHORITY} value={editing.budget_authority || []} onChange={(v) => update({ budget_authority: v })} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="exclusions">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2"><Ban className="w-4 h-4" />Exclusions (Never Target)</span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-5 pt-2">
                        <div className="space-y-2">
                          <Label>Exclude Industries</Label>
                          <TagInput value={editing.exclude_industries || []} onChange={(v) => update({ exclude_industries: v })} placeholder="e.g., Gambling" />
                        </div>
                        <div className="space-y-2">
                          <Label>Exclude Job Titles</Label>
                          <TagInput value={editing.exclude_titles || []} onChange={(v) => update({ exclude_titles: v })} placeholder="e.g., Intern, Student" />
                        </div>
                        <div className="space-y-2">
                          <Label>Exclude Keywords (in company name or description)</Label>
                          <TagInput value={editing.exclude_keywords || []} onChange={(v) => update({ exclude_keywords: v })} placeholder="e.g., agency, freelance, consulting" />
                        </div>
                        <div className="space-y-3 rounded-lg border border-border/60 p-3">
                          <Label className="text-sm">Hard exclusions</Label>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Headcount ceiling (drop accounts above)</Label>
                            <Input
                              type="number"
                              value={editing.exclude_headcount_ceiling ?? ""}
                              onChange={(e) => update({ exclude_headcount_ceiling: e.target.value ? parseInt(e.target.value) : null })}
                              placeholder="e.g., 5000"
                              className="w-40"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={!!editing.exclude_b2c} onCheckedChange={(c) => update({ exclude_b2c: !!c })} />
                            Exclude B2C companies
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={!!editing.exclude_non_english} onCheckedChange={(c) => update({ exclude_non_english: !!c })} />
                            Exclude non-English-primary markets
                          </label>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Exclude regulated verticals</Label>
                            <TagInput value={editing.exclude_regulated || []} onChange={(v) => update({ exclude_regulated: v })} placeholder="e.g., gambling, defense, tobacco" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Disqualifiers (free-form)</Label>
                          <Textarea
                            placeholder="Describe who is NOT a fit, even if they match the criteria above..."
                            value={editing.disqualifiers || ""}
                            onChange={(e) => update({ disqualifiers: e.target.value })}
                            className="min-h-[80px]"
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </TabsContent>

                {/* ─── SIGNALS ──────────────────────────── */}
                <TabsContent value="signals" className="space-y-6">
                  <div className="space-y-2">
                    <Label>Buying Signals to Watch</Label>
                    <p className="text-xs text-muted-foreground">Trigger events that indicate it's the right time to reach out.</p>
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {SIGNAL_OPTIONS.map((signal) => (
                        <label key={signal} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={(editing.buying_signals || []).includes(signal)}
                            onCheckedChange={(checked) => {
                              const current = editing.buying_signals || [];
                              update({ buying_signals: checked ? [...current, signal] : current.filter((s) => s !== signal) });
                            }}
                          />
                          {signal}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Trigger Events</Label>
                    <TagInput
                      value={editing.event_triggers || []}
                      onChange={(v) => update({ event_triggers: v })}
                      placeholder="e.g., Opened a new office in EU"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Hiring Signals</Label>
                    <MultiSelect options={HIRING_SIGNAL_OPTIONS} value={editing.hiring_signals || []} onChange={(v) => update({ hiring_signals: v })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Intent Keywords (what they search / post about)</Label>
                    <TagInput
                      value={editing.intent_keywords || []}
                      onChange={(v) => update({ intent_keywords: v })}
                      placeholder="e.g., 'replace ZoomInfo', 'lead enrichment'"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tech Stack They Use</Label>
                    <TagInput
                      value={editing.tech_stack || []}
                      onChange={(v) => update({ tech_stack: v })}
                      placeholder="e.g., HubSpot, Salesforce, Apollo"
                      suggestions={["HubSpot", "Salesforce", "Apollo", "Outreach", "Salesloft", "Gong", "ZoomInfo", "Clay", "Instantly", "Smartlead"]}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Competitor Tools (tools you replace)</Label>
                    <TagInput
                      value={editing.competitor_tools || []}
                      onChange={(v) => update({ competitor_tools: v })}
                      placeholder="e.g., ZoomInfo, Lusha"
                    />
                  </div>
                </TabsContent>

                {/* ─── STRATEGY ──────────────────────────── */}
                <TabsContent value="strategy" className="space-y-6">
                  <div className="space-y-2">
                    <Label>Preferred Outreach Channels</Label>
                    <p className="text-xs text-muted-foreground">Where this ICP is most reachable.</p>
                    <MultiSelect options={CHANNELS} value={editing.preferred_channels || []} onChange={(v) => update({ preferred_channels: v })} />
                  </div>

                  <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
                    <Label className="flex items-center gap-2 mb-2"><BarChart3 className="w-4 h-4" />Scoring Weights</Label>
                    <p className="text-xs text-muted-foreground">How much each criterion contributes to a lead's fit score (must total 100).</p>
                    {(["title", "industry", "size", "tech"] as const).map((key) => {
                      const weights = editing.scoring_weights || { title: 25, industry: 25, size: 25, tech: 25 };
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="capitalize">{key} match</span>
                            <span className="font-mono">{weights[key]}%</span>
                          </div>
                          <Slider
                            min={0} max={100} step={5}
                            value={[weights[key]]}
                            onValueChange={([v]) => update({ scoring_weights: { ...weights, [key]: v } })}
                          />
                        </div>
                      );
                    })}
                    {(() => {
                      const w = editing.scoring_weights || { title: 25, industry: 25, size: 25, tech: 25 };
                      const total = w.title + w.industry + w.size + w.tech;
                      return (
                        <p className={`text-xs ${total === 100 ? "text-green-500" : "text-yellow-500"}`}>
                          Total: {total}% {total !== 100 && "(should equal 100)"}
                        </p>
                      );
                    })()}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 pt-6 border-t mt-6 sticky bottom-0 bg-background">
                <Button onClick={handleSave} className="flex-1"><Save className="w-4 h-4 mr-2" />Save ICP</Button>
                {!isNew && editing.id && (
                  <Button variant="destructive" size="icon" onClick={() => { handleDelete(editing.id!); setEditing(null); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ICPLookalikesDialog
        open={!!lookalikeProfile}
        onOpenChange={(o) => { if (!o) setLookalikeProfile(null); }}
        profile={lookalikeProfile}
      />


      {gatedFeature && (
        <FeatureGateModal
          open={gateModalOpen}
          onOpenChange={setGateModalOpen}
          feature={gatedFeature}
          currentPlan={currentPlan}
        />
      )}
    </DashboardLayout>
  );
};

export default ICP;
