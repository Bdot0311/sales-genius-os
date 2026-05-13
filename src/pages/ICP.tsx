import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useICPProfiles, ICPProfile } from "@/hooks/use-icp-profiles";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Target, Plus, Trash2, X, Save, Lock } from "lucide-react";
import { toast } from "sonner";

const INDUSTRY_OPTIONS = ["SaaS", "E-commerce", "Healthcare", "Legal", "Finance", "Real Estate", "Agency", "Manufacturing", "Other"];
const GEO_OPTIONS = ["US", "Canada", "UK", "Europe", "Global"];
const REVENUE_OPTIONS = ["<$1M", "$1M–$10M", "$10M–$50M", "$50M+"];
const SIGNAL_OPTIONS = [
  "Recent funding round", "Hiring for sales roles", "Hiring for ops/finance",
  "Leadership change", "Product launch", "Expanding to new market", "Tech stack change",
];

const emptyProfile: Partial<ICPProfile> = {
  name: "", industries: [], company_size_min: 1, company_size_max: 10000,
  revenue_range: null, geographies: [], target_titles: [], tech_stack: [],
  buying_signals: [], pain_points: [], disqualifiers: null, notes: null,
};

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 text-xs">
            {tag}
            <button onClick={() => onChange(value.filter((t) => t !== tag))}><X className="w-3 h-3" /></button>
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

function getCompletionScore(p: Partial<ICPProfile>): number {
  const fields = [
    p.name, (p.industries || []).length > 0, p.company_size_min !== undefined,
    p.revenue_range, (p.geographies || []).length > 0, (p.target_titles || []).length > 0,
    (p.tech_stack || []).length > 0, (p.buying_signals || []).length > 0,
    (p.pain_points || []).length > 0, p.disqualifiers,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

const ICP = () => {
  const { profiles, isLoading, createProfile, updateProfile, deleteProfile } = useICPProfiles();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, gatedAction, checkLimit, features } = usePlanFeatures();
  const [editing, setEditing] = useState<Partial<ICPProfile> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [lookalikes, setLookalikes] = useState<any[]>([]);

  const handleDiscoverLookalikes = async () => {
    setIsDiscovering(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLookalikes([
      { name: "DataSync Inc", industry: "SaaS", size: "50-200", matchScore: 92 },
      { name: "FlowTech Corp", industry: "Fintech", size: "100-500", matchScore: 88 },
      { name: "ScaleUp Labs", industry: "MarTech", size: "50-200", matchScore: 84 },
    ]);
    setIsDiscovering(false);
  };

  const icpGated = !hasFeature('icpBuilder');

  const openNew = () => {
    if (icpGated) {
      gatedAction('icpBuilder', () => {});
      return;
    }
    // Check ICP profile limit
    const limit = features.icpProfiles as number;
    if (limit !== -1 && profiles.length >= limit) {
      gatedAction('higherLimits', () => {});
      return;
    }
    setEditing({ ...emptyProfile }); 
    setIsNew(true); 
  };
  const openEdit = (p: ICPProfile) => { 
    if (icpGated) {
      gatedAction('icpBuilder', () => {});
      return;
    }
    setEditing({ ...p }); 
    setIsNew(false); 
  };

  const handleSave = async () => {
    if (!editing?.name?.trim()) { toast.error("Profile name is required"); return; }
    if (isNew) {
      await createProfile.mutateAsync(editing);
    } else if (editing?.id) {
      await updateProfile.mutateAsync({ id: editing.id, ...editing } as any);
    }
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await deleteProfile.mutateAsync(id);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ideal Customer Profiles</h1>
            <p className="text-muted-foreground">Define and manage your target customer profiles</p>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New ICP</Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
        ) : profiles.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Target className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No ICPs yet</h3>
              <p className="text-muted-foreground text-center mb-4">Create your first Ideal Customer Profile to score leads automatically.</p>
              <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Create First ICP</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((p) => {
              const score = getCompletionScore(p);
              return (
                <Card key={p.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => openEdit(p)}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      <Badge variant="outline" className={score >= 70 ? "text-green-500 border-green-500/30" : score >= 40 ? "text-yellow-500 border-yellow-500/30" : "text-red-500 border-red-500/30"}>
                        {score}% complete
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {p.industries.length > 0 && (
                      <div className="flex flex-wrap gap-1">{p.industries.slice(0, 3).map((i) => <Badge key={i} variant="secondary" className="text-xs">{i}</Badge>)}{p.industries.length > 3 && <Badge variant="outline" className="text-xs">+{p.industries.length - 3}</Badge>}</div>
                    )}
                    <p className="text-xs text-muted-foreground">{p.company_size_min}–{p.company_size_max} employees</p>
                    {p.target_titles.length > 0 && (
                      <div className="flex flex-wrap gap-1">{p.target_titles.slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
                    )}
                    {p.pain_points.length > 0 && (
                      <ul className="text-xs text-muted-foreground list-disc pl-4">{p.pain_points.slice(0, 3).map((pp, i) => <li key={i}>{pp}</li>)}</ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ICP Lookalike Discovery */}
        <Card>
          <CardHeader>
            <CardTitle>ICP Lookalike Discovery</CardTitle>
            <CardDescription>Find new prospects that look like your best closed-won deals</CardDescription>
          </CardHeader>
          <CardContent>
            {hasFeature('icpLookalike') ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  We analyze patterns from your closed-won deals and surface new prospects with matching signals.
                </p>
                <Button onClick={handleDiscoverLookalikes} disabled={isDiscovering}>
                  {isDiscovering ? "Discovering..." : "Discover Lookalikes"}
                </Button>
                {lookalikes.length > 0 && (
                  <div className="mt-6 space-y-3">
                    {lookalikes.map((prospect, index) => (
                      <div key={index} className="flex items-center justify-between rounded-lg border px-4 py-3">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{prospect.name}</p>
                          <p className="text-xs text-muted-foreground">{prospect.industry} · {prospect.size} employees</p>
                        </div>
                        <Badge variant="secondary" className="text-xs tabular-nums">
                          {prospect.matchScore}% match
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-3">Lookalike discovery is available on Growth plan and above.</p>
                <Button variant="outline" onClick={() => gatedAction('icpLookalike', () => {})}>Upgrade Plan</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Editor Sheet */}
      <Sheet open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isNew ? "New ICP Profile" : "Edit ICP Profile"}</SheetTitle>
            <SheetDescription>Define your ideal customer characteristics</SheetDescription>
          </SheetHeader>
          {editing && (
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label>Profile Name</Label>
                <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g., Mid-Market SaaS" />
              </div>

              <div className="space-y-2">
                <Label>Industries</Label>
                <MultiSelect options={INDUSTRY_OPTIONS} value={editing.industries || []} onChange={(v) => setEditing({ ...editing, industries: v })} />
              </div>

              <div className="space-y-2">
                <Label>Company Size ({editing.company_size_min}–{editing.company_size_max} employees)</Label>
                <Slider
                  min={1} max={10000} step={10}
                  value={[editing.company_size_min || 1, editing.company_size_max || 10000]}
                  onValueChange={([min, max]) => setEditing({ ...editing, company_size_min: min, company_size_max: max })}
                />
              </div>

              <div className="space-y-2">
                <Label>Annual Revenue Range</Label>
                <Select value={editing.revenue_range || ""} onValueChange={(v) => setEditing({ ...editing, revenue_range: v })}>
                  <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                  <SelectContent>{REVENUE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Geography</Label>
                <MultiSelect options={GEO_OPTIONS} value={editing.geographies || []} onChange={(v) => setEditing({ ...editing, geographies: v })} />
              </div>

              <div className="space-y-2">
                <Label>Target Job Titles</Label>
                <TagInput value={editing.target_titles || []} onChange={(v) => setEditing({ ...editing, target_titles: v })} placeholder="Type a title and press Enter" />
              </div>

              <div className="space-y-2">
                <Label>Tech Stack They Use</Label>
                <TagInput value={editing.tech_stack || []} onChange={(v) => setEditing({ ...editing, tech_stack: v })} placeholder="Type a technology and press Enter" />
              </div>

              <div className="space-y-2">
                <Label>Buying Signals to Watch</Label>
                <div className="grid grid-cols-1 gap-2">
                  {SIGNAL_OPTIONS.map((signal) => (
                    <label key={signal} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(editing.buying_signals || []).includes(signal)}
                        onCheckedChange={(checked) => {
                          const current = editing.buying_signals || [];
                          setEditing({ ...editing, buying_signals: checked ? [...current, signal] : current.filter((s) => s !== signal) });
                        }}
                      />
                      {signal}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Top 3 Pain Points</Label>
                {[0, 1, 2].map((i) => (
                  <Input
                    key={i}
                    placeholder={`Pain point ${i + 1}`}
                    value={(editing.pain_points || [])[i] || ""}
                    onChange={(e) => {
                      const pp = [...(editing.pain_points || [])];
                      pp[i] = e.target.value;
                      setEditing({ ...editing, pain_points: pp.filter((p) => p) });
                    }}
                  />
                ))}
              </div>

              <div className="space-y-2">
                <Label>Disqualifiers</Label>
                <Textarea
                  placeholder="Describe who is NOT a fit..."
                  value={editing.disqualifiers || ""}
                  onChange={(e) => setEditing({ ...editing, disqualifiers: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any additional notes..."
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} className="flex-1"><Save className="w-4 h-4 mr-2" />Save</Button>
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
