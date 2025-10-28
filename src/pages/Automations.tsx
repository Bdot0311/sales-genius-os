import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Zap, Loader2, Workflow as WorkflowIcon, List } from "lucide-react";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { Node, Edge } from "reactflow";

interface Workflow {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
  user_id: string;
  workflow_type?: string;
  nodes?: Node[];
  edges?: Edge[];
  created_at?: string;
  updated_at?: string;
}

const Automations = () => {
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'visual' | 'list'>('visual');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Parse JSON data
      const parsedWorkflows = (data || []).map(w => ({
        ...w,
        nodes: (w.nodes as any) || [],
        edges: (w.edges as any) || [],
      }));
      
      setWorkflows(parsedWorkflows);
    } catch (error: any) {
      toast({
        title: "Error loading workflows",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVisualWorkflow = async () => {
    if (!newWorkflowName) {
      toast({
        title: "Missing information",
        description: "Please enter a workflow name",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("workflows").insert({
        user_id: user.id,
        name: newWorkflowName,
        trigger: "",
        action: "",
        active: false,
        workflow_type: 'visual',
        nodes: [],
        edges: [],
      }).select().single();

      if (error) throw error;

      toast({
        title: "Workflow created",
        description: "Start building your automation workflow",
      });

      setIsDialogOpen(false);
      setNewWorkflowName("");
      setSelectedWorkflow({
        ...data,
        nodes: (data.nodes as any) || [],
        edges: (data.edges as any) || [],
      });
      setViewMode('visual');
      loadWorkflows();
    } catch (error: any) {
      toast({
        title: "Error creating workflow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSaveWorkflow = async (nodes: Node[], edges: Edge[]) => {
    if (!selectedWorkflow) return;

    try {
      const { error } = await supabase
        .from("workflows")
        .update({ 
          nodes: nodes as any,
          edges: edges as any,
        })
        .eq("id", selectedWorkflow.id);

      if (error) throw error;

      loadWorkflows();
    } catch (error: any) {
      toast({
        title: "Error saving workflow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleWorkflow = async (id: string) => {
    try {
      const workflow = workflows.find((w) => w.id === id);
      if (!workflow) return;

      const { error } = await supabase
        .from("workflows")
        .update({ active: !workflow.active })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Workflow updated",
        description: `Workflow ${workflow.active ? 'paused' : 'activated'}`,
      });

      loadWorkflows();
    } catch (error: any) {
      toast({
        title: "Error updating workflow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setViewMode('visual');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Automations</h1>
            <p className="text-muted-foreground">
              Build visual workflows to automate your sales process
            </p>
          </div>
          <div className="flex gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'visual' | 'list')}>
              <TabsList>
                <TabsTrigger value="visual">
                  <WorkflowIcon className="w-4 h-4 mr-2" />
                  Visual
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List className="w-4 h-4 mr-2" />
                  List
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Workflow
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
                      value={newWorkflowName}
                      onChange={(e) => setNewWorkflowName(e.target.value)}
                      placeholder="e.g., Auto-follow up new leads"
                    />
                  </div>
                  <Button onClick={handleCreateVisualWorkflow} className="w-full">
                    Create Visual Workflow
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <Card className="p-12">
            <div className="text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
              <p className="text-muted-foreground">Loading workflows...</p>
            </div>
          </Card>
        ) : viewMode === 'visual' ? (
          selectedWorkflow ? (
            <div className="h-[calc(100%-5rem)] border border-border rounded-lg overflow-hidden bg-card">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-xl font-semibold">{selectedWorkflow.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedWorkflow.active ? "Active" : "Draft"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setSelectedWorkflow(null)}>
                  Back to List
                </Button>
              </div>
              <div className="h-[calc(100%-4rem)]">
                <WorkflowCanvas
                  workflowId={selectedWorkflow.id}
                  initialNodes={selectedWorkflow.nodes || []}
                  initialEdges={selectedWorkflow.edges || []}
                  onSave={handleSaveWorkflow}
                />
              </div>
            </div>
          ) : workflows.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first visual automation workflow
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((workflow) => (
                <Card 
                  key={workflow.id} 
                  className="p-6 cursor-pointer hover:border-primary/50 transition-all"
                  onClick={() => handleEditWorkflow(workflow)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${workflow.active ? 'bg-green-500/10' : 'bg-muted'}`}>
                        <Zap className={`w-5 h-5 ${workflow.active ? 'text-green-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{workflow.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {workflow.active ? "Active" : "Draft"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      {workflow.nodes?.length || 0} nodes • {workflow.edges?.length || 0} connections
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          <div className="text-center p-12">
            <p className="text-muted-foreground">List view - Switch to Visual mode to build workflows</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Automations;
