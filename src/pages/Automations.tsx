import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Zap, Play, Pause } from "lucide-react";

interface Workflow {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
}

const Automations = () => {
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: "",
    trigger: "",
    action: "",
  });

  useEffect(() => {
    const savedWorkflows = localStorage.getItem("workflows");
    if (savedWorkflows) {
      setWorkflows(JSON.parse(savedWorkflows));
    }
  }, []);

  const saveWorkflows = (updatedWorkflows: Workflow[]) => {
    setWorkflows(updatedWorkflows);
    localStorage.setItem("workflows", JSON.stringify(updatedWorkflows));
  };

  const handleCreateWorkflow = () => {
    if (!newWorkflow.name || !newWorkflow.trigger || !newWorkflow.action) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const workflow: Workflow = {
      id: Date.now().toString(),
      ...newWorkflow,
      active: true,
    };

    saveWorkflows([...workflows, workflow]);
    toast({
      title: "Workflow created",
      description: "Your automation is now active",
    });

    setIsDialogOpen(false);
    setNewWorkflow({ name: "", trigger: "", action: "" });
  };

  const toggleWorkflow = (id: string) => {
    const updated = workflows.map((w) =>
      w.id === id ? { ...w, active: !w.active } : w
    );
    saveWorkflows(updated);
    toast({
      title: "Workflow updated",
      description: "Workflow status changed",
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Automations</h1>
            <p className="text-muted-foreground">
              Automate your sales workflows and save time
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Workflow</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Workflow Name</Label>
                  <Input
                    value={newWorkflow.name}
                    onChange={(e) =>
                      setNewWorkflow({ ...newWorkflow, name: e.target.value })
                    }
                    placeholder="e.g., Auto-follow up new leads"
                  />
                </div>
                <div>
                  <Label>Trigger</Label>
                  <Select
                    value={newWorkflow.trigger}
                    onValueChange={(value) =>
                      setNewWorkflow({ ...newWorkflow, trigger: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_lead">New Lead Added</SelectItem>
                      <SelectItem value="deal_stage_change">Deal Stage Changed</SelectItem>
                      <SelectItem value="meeting_completed">Meeting Completed</SelectItem>
                      <SelectItem value="no_response_3days">No Response for 3 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Action</Label>
                  <Select
                    value={newWorkflow.action}
                    onValueChange={(value) =>
                      setNewWorkflow({ ...newWorkflow, action: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send_email">Send Email</SelectItem>
                      <SelectItem value="create_task">Create Task</SelectItem>
                      <SelectItem value="update_lead_score">Update Lead Score</SelectItem>
                      <SelectItem value="notify_team">Notify Team</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateWorkflow} className="w-full">
                  Create Workflow
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {workflows.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first automation to streamline your sales process
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${workflow.active ? 'bg-green-500/10' : 'bg-muted'}`}>
                      <Zap className={`w-5 h-5 ${workflow.active ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{workflow.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {workflow.active ? "Active" : "Paused"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleWorkflow(workflow.id)}
                  >
                    {workflow.active ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Trigger:</span>
                    <p className="font-medium">{workflow.trigger}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Action:</span>
                    <p className="font-medium">{workflow.action}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Automations;
