import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSequences } from "@/hooks/use-sequences";
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
    description: "5-step, 14-day signal-based outreach",
    icon: Zap,
    steps: [
      { delay_days: 0, delay_hours: 0, subject_template: "Noticed {{company_name}}'s recent move", body_template: "Hi {{contact_name}},\n\nI saw {{company_name}} just {{signal}} — congrats. Teams in your position often find that {{pain_point}} becomes a bottleneck fast.\n\nWe help companies like yours solve that in weeks, not months.\n\nWorth a quick look?", trigger_condition: "on_enroll" },
      { delay_days: 3, delay_hours: 0, subject_template: "LinkedIn connection request", body_template: "Send a LinkedIn connection request to {{contact_name}}. Use this note:\n\n\"Hi {{contact_name}}, I shared some ideas about {{company_name}}'s growth — thought we should connect.\"", trigger_condition: "on_delay" },
      { delay_days: 5, delay_hours: 0, subject_template: "Different angle on {{company_name}}", body_template: "Hi {{contact_name}},\n\nQuick follow-up — wanted to share a different angle.\n\nTeams scaling as fast as {{company_name}} typically waste 15+ hours/week on manual prospecting. We cut that to under 2.\n\nOpen to 15 minutes this week?", trigger_condition: "on_delay" },
      { delay_days: 8, delay_hours: 0, subject_template: "Thought you'd find this useful", body_template: "Hi {{contact_name}},\n\nNo pitch today — just sharing an insight on how fast-growing teams are rethinking outbound.\n\nThe shift from batch-and-blast to signal-based outreach typically sees 2-4x higher reply rates.\n\nWorth exploring?", trigger_condition: "on_delay" },
      { delay_days: 14, delay_hours: 0, subject_template: "Closing the loop", body_template: "Hi {{contact_name}},\n\nI'll keep this short — I've reached out a few times and don't want to be a nuisance.\n\nIf the timing isn't right, no worries at all. If things change, I'm here.\n\nWishing {{company_name}} continued success.", trigger_condition: "on_delay" },
    ],
  },
  {
    id: "executive-thread",
    name: "Executive Thread",
    description: "3-step, 7-day C-suite sequence",
    icon: Crown,
    steps: [
      { delay_days: 0, delay_hours: 0, subject_template: "{{company_name}}'s {{pain_point}} challenge", body_template: "Hi {{contact_name}},\n\n{{company_name}} is scaling fast, and I imagine {{pain_point}} is on your radar.\n\nWe help leaders like you solve that. Worth a look?", trigger_condition: "on_enroll" },
      { delay_days: 3, delay_hours: 0, subject_template: "Re: {{company_name}}'s {{pain_point}} challenge", body_template: "Hi {{contact_name}},\n\nWanted to make sure this didn't get buried.\n\nHappy to share how we helped a similar company cut their outreach time by 3x. Should I send over a brief overview?", trigger_condition: "on_delay" },
      { delay_days: 7, delay_hours: 0, subject_template: "Re: {{company_name}}'s {{pain_point}} challenge", body_template: "Hi {{contact_name}},\n\nI'll assume the timing isn't right — totally understand.\n\nIf things shift, I'd love to reconnect. Wishing you and {{company_name}} a strong quarter.", trigger_condition: "on_delay" },
    ],
  },
  {
    id: "the-challenger",
    name: "The Challenger",
    description: "4-step, 10-day insight-led sequence",
    icon: Target,
    steps: [
      { delay_days: 0, delay_hours: 0, subject_template: "The biggest mistake in {{industry}} outbound", body_template: "Hi {{contact_name}},\n\nMost {{industry}} teams still rely on batch-and-blast email. The data says that approach fails 95% of the time.\n\nThe top 5% are doing something different — and it's not what you'd expect.\n\nWorth seeing how they do it?", trigger_condition: "on_enroll" },
      { delay_days: 4, delay_hours: 0, subject_template: "The data behind the claim", body_template: "Hi {{contact_name}},\n\nFollowing up with the data I mentioned:\n\nTeams using signal-based outreach see 2-4x higher reply rates vs. traditional cold email.\n\nWe've helped companies like {{company_name}} get there. Happy to show you how.", trigger_condition: "on_delay" },
      { delay_days: 7, delay_hours: 0, subject_template: "Did this resonate?", body_template: "Hi {{contact_name}},\n\nCurious if the insight about signal-based outreach resonated with what you're seeing at {{company_name}}.\n\nIf so, I'd love to share a quick framework that makes it actionable. No commitment — just value.", trigger_condition: "on_delay" },
      { delay_days: 10, delay_hours: 0, subject_template: "Last note from me", body_template: "Hi {{contact_name}},\n\nI'll leave it here. If the ideas I shared were off-base, no hard feelings.\n\nBut if {{company_name}} ever revisits its outbound strategy, I'd be glad to help.\n\nAll the best.", trigger_condition: "on_delay" },
    ],
  },
];

export function SequencesList() {
  const navigate = useNavigate();
  const { sequences, isLoading, createSequence, updateSequence, deleteSequence } = useSequences();
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Sequences</h1>
          <p className="text-muted-foreground">
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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sequences yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first email sequence to start automating outreach.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Sequence
            </Button>
          </CardContent>
        </Card>
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
