import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bot, Plus, Star, Trash2, Loader2, Lock } from "lucide-react";
import type { AgentConfig } from "@/pages/Agent";
import { AGENT_ROLES, roleLabel, type AgentRole } from "./AgentRoles";

interface AgentSwitcherProps {
  agents: AgentConfig[];
  activeAgentId: string | null;
  userId: string | null;
  maxBuilds: number; // -1 = unlimited
  loading?: boolean;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

export function AgentSwitcher({
  agents,
  activeAgentId,
  userId,
  maxBuilds,
  loading,
  onSelect,
  onChanged,
}: AgentSwitcherProps) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AgentRole>("lead_gen");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentConfig | null>(null);

  const unlimited = maxBuilds === -1;
  const atLimit = !unlimited && agents.length >= maxBuilds;

  const handleCreate = async () => {
    if (!userId) return;
    if (atLimit) return;
    setCreating(true);
    try {
      const { data, error } = await (supabase as any)
        .from("agent_configs")
        .insert({
          user_id: userId,
          agent_name: newName.trim() || `Agent ${agents.length + 1}`,
          role: newRole,
          is_primary: agents.length === 0,
          enabled: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Agent created");
      setCreateOpen(false);
      setNewName("");
      setNewRole("lead_gen");
      onChanged();
      if (data?.id) onSelect(data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to create agent: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleMakePrimary = async (agent: AgentConfig) => {
    if (!userId) return;
    setBusyId(agent.id);
    try {
      const { error: clearError } = await (supabase as any)
        .from("agent_configs")
        .update({ is_primary: false })
        .eq("user_id", userId)
        .eq("is_primary", true);
      if (clearError) throw clearError;
      const { error } = await (supabase as any)
        .from("agent_configs")
        .update({ is_primary: true })
        .eq("id", agent.id);
      if (error) throw error;
      toast.success(`${agent.agent_name ?? "Agent"} is now primary`);
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to set primary: ${message}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const agent = deleteTarget;
    if (!agent) return;
    setBusyId(agent.id);
    try {
      const { error } = await (supabase as any)
        .from("agent_configs")
        .delete()
        .eq("id", agent.id);
      if (error) throw error;
      toast.success("Agent deleted");
      setDeleteTarget(null);
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to delete: ${message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold">Your agents</p>
          <p className="text-xs text-muted-foreground">
            {unlimited
              ? `${agents.length} built — unlimited builds on your plan`
              : `${agents.length} of ${maxBuilds} agent build${
                  maxBuilds === 1 ? "" : "s"
                } used`}
            {" · "}
            each agent gets its own role, persona, ICP and limits
          </p>
        </div>
        {atLimit ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate("/pricing")}
          >
            <Lock className="w-3.5 h-3.5" />
            Upgrade for more agents
          </Button>
        ) : (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" disabled={!userId || loading}>
                <Plus className="w-4 h-4" />
                New agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Build a new agent</DialogTitle>
                <DialogDescription>
                  Give it a name and a role so you know what each agent is
                  responsible for.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-agent-name">Agent name</Label>
                  <Input
                    id="new-agent-name"
                    placeholder='e.g. "Scout — EU lead gen"'
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-agent-role">Role</Label>
                  <Select
                    value={newRole}
                    onValueChange={(v) => setNewRole(v as AgentRole)}
                  >
                    <SelectTrigger id="new-agent-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label} — {r.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create agent
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {agents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No agents yet — create your first one to get started.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const active = agent.id === activeAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelect(agent.id)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 bg-card/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Bot
                    className={`w-4 h-4 flex-shrink-0 ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span className="text-sm font-medium truncate">
                    {agent.agent_name || "Untitled agent"}
                  </span>
                  {agent.is_primary && (
                    <Badge
                      variant="outline"
                      className="ml-auto bg-primary/10 text-primary border-primary/30 text-[10px]"
                    >
                      Primary
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px]">
                    {roleLabel(agent.role)}
                  </Badge>
                  <span
                    className={`text-[11px] ${
                      agent.enabled ? "text-green-400" : "text-muted-foreground"
                    }`}
                  >
                    {agent.enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {!agent.is_primary && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] gap-1"
                        disabled={busyId === agent.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMakePrimary(agent);
                        }}
                      >
                        <Star className="w-3 h-3" />
                        Make primary
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                        disabled={busyId === agent.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(agent);
                        }}
                        aria-label="Delete agent"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.agent_name || "this agent"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its configuration is removed permanently. Leads, emails and
              activity history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
