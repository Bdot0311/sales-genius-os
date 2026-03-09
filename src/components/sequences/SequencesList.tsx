import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSequences } from "@/hooks/use-sequences";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function SequencesList() {
  const navigate = useNavigate();
  const { sequences, isLoading, createSequence, updateSequence, deleteSequence } = useSequences();
  const { features, getLimit, isAdmin, currentPlan } = usePlanFeatures();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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
  };

  const handleToggleStatus = async (sequence: typeof sequences[0]) => {
    const newStatus = sequence.status === 'active' ? 'paused' : 'active';
    
    if (newStatus === 'active' && !canCreateMore) {
      return; // Show upgrade prompt instead
    }
    
    await updateSequence.mutateAsync({
      id: sequence.id,
      status: newStatus,
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
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canCreateMore && sequences.some(s => s.status !== 'draft')}>
                <Plus className="w-4 h-4 mr-2" />
                New Sequence
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!newName.trim()}>
                  Create Sequence
                </Button>
              </DialogFooter>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
