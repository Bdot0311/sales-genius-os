import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSequences } from "@/hooks/use-sequences";
import { useSequenceUsage } from "@/hooks/use-email-usage";

import { usePlanFeatures } from "@/hooks/use-plan-features";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import {
  Plus,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Edit,
  Users,
  Mail,
  Clock,
  Zap,
  Target,
  Crown,
  FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SEQUENCE_TEMPLATES = [
  {
    id: "signal-strike",
    name: "Signal Strike",
    description: "4-touch, 14-day signal-based sequence",
    icon: Zap,
    steps: [
      {
        delay_days: 0,
        delay_hours: 0,
        subject_template: "{{company_name}} question",
        body_template: `{{contact_name}}, saw {{company_name}} {{signal}}.\n\nMost {{industry}} teams at your stage hit a wall with {{pain_point}}—it compounds fast.\n\nWe helped {{custom_case_study_name}} cut that time by 60% in 90 days.\n\nWorth a quick look?`,
        trigger_condition: "on_enroll",
      },
      {
        delay_days: 3,
        delay_hours: 0,
        subject_template: "Re: {{company_name}} question",
        body_template: `{{contact_name}}, one more angle:\n\nTeams scaling like {{company_name}} usually find {{pain_point}} eats 10-15 hours a week nobody budgeted for.\n\nWe fix that without adding headcount.\n\n{{custom_case_study_name}} saw results in the first 30 days.\n\nOpen to a 15-min call this week?`,
        trigger_condition: "on_delay",
      },
      {
        delay_days: 8,
        delay_hours: 0,
        subject_template: "Timing question",
        body_template: `{{contact_name}}, not sure if Q{{custom_quarter}} is the right time for {{company_name}}.\n\nIf it's not, happy to reconnect when it makes sense—I'll follow up in a few months.\n\nIf you are evaluating options now, I can send a one-pager on how we compare to {{competitor1}}.\n\nWhich fits better?`,
        trigger_condition: "on_delay",
      },
      {
        delay_days: 14,
        delay_hours: 0,
        subject_template: "Closing the loop",
        body_template: `{{contact_name}}, I'll leave it here.\n\nIf {{pain_point}} becomes a priority at {{company_name}}, I'd be glad to help—just reply to this thread.\n\nWishing you a strong quarter.`,
        trigger_condition: "on_delay",
      },
    ],
  },
  {
    id: "executive-thread",
    name: "Executive Thread",
    description: "3-touch, 7-day C-suite sequence",
    icon: Crown,
    steps: [
      {
        delay_days: 0,
        delay_hours: 0,
        subject_template: "{{company_name}}'s {{pain_point}}",
        body_template: `{{contact_name}}, {{company_name}} is scaling fast.\n\nLeaders at your stage tell us {{pain_point}} becomes the bottleneck nobody sees coming until it costs a quarter.\n\nWe solved that for {{custom_case_study_name}}—{{custom_result}} in 6 months.\n\nWorth a look?`,
        trigger_condition: "on_enroll",
      },
      {
        delay_days: 3,
        delay_hours: 0,
        subject_template: "Re: {{company_name}}'s {{pain_point}}",
        body_template: `{{contact_name}}, wanted to make sure this didn't get buried.\n\nHappy to share a one-pager on how we helped a similar {{industry}} company hit {{custom_result}}—no call needed yet.\n\nShould I send it over?`,
        trigger_condition: "on_delay",
      },
      {
        delay_days: 7,
        delay_hours: 0,
        subject_template: "Re: {{company_name}}'s {{pain_point}}",
        body_template: `{{contact_name}}, timing may not be right—completely understood.\n\nIf things shift at {{company_name}}, I'd welcome the chance to reconnect.\n\nWishing you and the team a strong quarter.`,
        trigger_condition: "on_delay",
      },
    ],
  },
  {
    id: "the-challenger",
    name: "The Challenger",
    description: "4-touch, 10-day insight-led sequence",
    icon: Target,
    steps: [
      {
        delay_days: 0,
        delay_hours: 0,
        subject_template: "{{industry}} outbound mistake",
        body_template: `{{contact_name}}, most {{industry}} teams still run batch-and-blast email.\n\nThe data says that approach fails 95% of the time—the top 5% do something different.\n\nWe helped {{custom_case_study_name}} hit a 6% reply rate in 60 days using signal-based outreach.\n\nWorth seeing how they did it?`,
        trigger_condition: "on_enroll",
      },
      {
        delay_days: 4,
        delay_hours: 0,
        subject_template: "The data behind this",
        body_template: `{{contact_name}}, the stat I mentioned:\n\nSignal-based outreach drives 2-4x higher reply rates vs. traditional cold email in {{industry}}.\n\n{{custom_case_study_name}} went from 1% to 5.8% reply rate in one quarter.\n\nHappy to show {{company_name}} the playbook—quick call?`,
        trigger_condition: "on_delay",
      },
      {
        delay_days: 7,
        delay_hours: 0,
        subject_template: "Did this land?",
        body_template: `{{contact_name}}, curious if the signal-based angle resonated with what you're seeing at {{company_name}}.\n\nIf so, I have a short framework that makes it immediately actionable—no commitment, just value.\n\nWant me to send it?`,
        trigger_condition: "on_delay",
      },
      {
        delay_days: 10,
        delay_hours: 0,
        subject_template: "Last note",
        body_template: `{{contact_name}}, I'll leave it here.\n\nIf {{company_name}} ever revisits its outbound strategy, reply to this thread—happy to help.\n\nAll the best.`,
        trigger_condition: "on_delay",
      },
    ],
  },
];

export function SequencesList() {
  const navigate = useNavigate();
  const { sequences, isLoading, createSequence, updateSequence, deleteSequence } = useSequences();
  const { data: sequenceUsage } = useSequenceUsage();

  const { features, getLimit, isAdmin, currentPlan } = usePlanFeatures();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"choose" | "scratch" | "template">("choose");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const activeSequences = sequences.filter(s => s.status === 'active').length;
  const maxSequences = features.activeSequences;
  const isUnlimited = maxSequences === -1 || isAdmin;
  const canCreateMore = isUnlimited || activeSequences < maxSequences;
  
  const formatLimit = (limit: number) => limit === -1 ? '∞' : limit.toString();

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    await createSequence.mutateAsync({
      name: newName,
      description: newDescription || undefined,
    });
    
    setNewName("");
    setNewDescription("");
    setIsCreateOpen(false);
    setCreateMode("choose");
  };

  const handleCreateFromTemplate = async (template: typeof SEQUENCE_TEMPLATES[0]) => {
    const result = await createSequence.mutateAsync({
      name: template.name,
      description: template.description,
    });

    // Navigate to builder where user can see pre-populated steps
    // The steps will be created in the builder
    if (result?.id) {
      // Store template in sessionStorage for the builder to pick up
      sessionStorage.setItem(`sequence_template_${result.id}`, JSON.stringify(template.steps));
      navigate(`/dashboard/sequences/${result.id}`);
    }

    setIsCreateOpen(false);
    setCreateMode("choose");
  };

  const handleToggleStatus = async (sequence: typeof sequences[0]) => {
    const newStatus = sequence.status === 'active' ? 'paused' : 'active';
    
    if (newStatus === 'active' && !canCreateMore) {
      return;
    }
    
    await updateSequence.mutateAsync({
      id: sequence.id,
      status: newStatus,
    });
  };

  const handleToggleABTest = async (sequence: typeof sequences[0], enabled: boolean) => {
    await updateSequence.mutateAsync({
      id: sequence.id,
      ab_test_enabled: enabled,
    });
  };

  const handleDelete = async (id: string) => {
    await deleteSequence.mutateAsync(id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'paused': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'draft': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border/60 bg-card">
            <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Email Sequences</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automated multi-step email campaigns
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-3 py-1">
            {activeSequences}/{formatLimit(maxSequences)} active
          </Badge>
          
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setCreateMode("choose");
          }}>
            <DialogTrigger asChild>
              <Button disabled={!canCreateMore && sequences.some(s => s.status !== 'draft')}>
                <Plus className="w-4 h-4 mr-2" />
                New Sequence
              </Button>
            </DialogTrigger>
            <DialogContent className={createMode === "template" ? "max-w-2xl" : ""}>
              {createMode === "choose" && (
                <>
                  <DialogHeader>
                    <DialogTitle>Create New Sequence</DialogTitle>
                    <DialogDescription>
                      Start from scratch or use a proven template.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <button
                      onClick={() => setCreateMode("scratch")}
                      className="flex flex-col items-center gap-3 p-6 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="w-8 h-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="font-medium">Start from scratch</p>
                        <p className="text-xs text-muted-foreground">Build your own sequence step by step</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setCreateMode("template")}
                      className="flex flex-col items-center gap-3 p-6 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Zap className="w-8 h-8 text-primary" />
                      <div className="text-center">
                        <p className="font-medium">Use a template</p>
                        <p className="text-xs text-muted-foreground">Pre-built sequences, ready to customize</p>
                      </div>
                    </button>
                  </div>
                </>
              )}

              {createMode === "scratch" && (
                <>
                  <DialogHeader>
                    <DialogTitle>Create New Sequence</DialogTitle>
                    <DialogDescription>
                      Set up an automated email sequence to nurture your leads.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Sequence Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Cold Outreach - SaaS Founders"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description (optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="Describe the purpose of this sequence..."
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateMode("choose")}>
                      Back
                    </Button>
                    <Button onClick={handleCreate} disabled={!newName.trim()}>
                      Create Sequence
                    </Button>
                  </DialogFooter>
                </>
              )}

              {createMode === "template" && (
                <>
                  <DialogHeader>
                    <DialogTitle>Choose a Template</DialogTitle>
                    <DialogDescription>
                      Select a proven sequence template to get started quickly.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-4">
                    {SEQUENCE_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleCreateFromTemplate(template)}
                        className="w-full flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="p-2 rounded-lg bg-primary/10">
                          <template.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{template.name}</p>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{template.steps.length} steps</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateMode("choose")}>
                      Back
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Upgrade prompt if at limit */}
      {!canCreateMore && (
        <UpgradePrompt
          feature="More Active Sequences"
          requiredPlan="pro"
        />
      )}

      {/* Sequences Grid */}
      {sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Mail className="w-5 h-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No sequences yet</h3>
          <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed mb-4">
            Create your first email sequence to automate follow-ups with signal-based, 4-touch campaigns that average 3–8% reply rates.
          </p>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Sequence
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sequences.map((sequence) => (
            <Card 
              key={sequence.id} 
              className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/dashboard/sequences/${sequence.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{sequence.name}</CardTitle>
                    {sequence.description && (
                      <CardDescription className="line-clamp-2">
                        {sequence.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/sequences/${sequence.id}`);
                      }}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStatus(sequence);
                        }}
                        disabled={sequence.status === 'active' && !canCreateMore}
                      >
                        {sequence.status === 'active' ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(sequence.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <Badge 
                    variant="outline" 
                    className={getStatusColor(sequence.status)}
                  >
                    {sequence.status}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{sequence.total_enrollments || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{formatDistanceToNow(new Date(sequence.updated_at), { addSuffix: true })}</span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto" title="Emails sent this month">
                    <Mail className="w-4 h-4" />
                    <span>{(sequenceUsage?.find(u => u.sequence_id === sequence.id)?.sent_this_month ?? 0).toLocaleString()}/mo</span>
                  </div>
                </div>

                {/* A/B Test toggle */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground">A/B Test</span>
                  <div className="flex items-center gap-2">
                    {(sequence as any).ab_test_enabled && (
                      <Badge variant="secondary" className="text-xs">50/50</Badge>
                    )}
                    <Switch
                      checked={(sequence as any).ab_test_enabled || false}
                      onCheckedChange={(checked) => handleToggleABTest(sequence, checked)}
                      className="scale-75"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
