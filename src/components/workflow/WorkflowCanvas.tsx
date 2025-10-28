import { useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  BackgroundVariant,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { ConditionNode } from './nodes/ConditionNode';
import { NodeToolbar } from './NodeToolbar';
import { WorkflowPanel } from './WorkflowPanel';
import { Button } from '@/components/ui/button';
import { Save, Play, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

interface WorkflowCanvasProps {
  workflowId?: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export const WorkflowCanvas = ({ 
  workflowId,
  initialNodes = [],
  initialEdges = [],
  onSave 
}: WorkflowCanvasProps) => {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const addNode = useCallback((type: 'trigger' | 'action' | 'condition') => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { 
        label: type.charAt(0).toUpperCase() + type.slice(1),
        config: {}
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const updateNodeData = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
  }, [setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(nodes, edges);
      toast({
        title: "Workflow saved",
        description: "Your automation workflow has been saved successfully",
      });
    }
  }, [nodes, edges, onSave, toast]);

  const handleTest = useCallback(async () => {
    if (!workflowId) {
      toast({
        title: "Cannot test",
        description: "Please save the workflow first",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Testing workflow",
        description: "Executing your workflow...",
      });

      const { data, error } = await supabase.functions.invoke('execute-workflow', {
        body: { 
          workflowId,
          testData: {
            test: true,
            timestamp: new Date().toISOString(),
          }
        },
      });

      if (error) throw error;

      toast({
        title: "Test completed",
        description: `Workflow executed ${data.executionLog.length} steps successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [workflowId, toast]);

  const handleRun = useCallback(async () => {
    if (!workflowId) {
      toast({
        title: "Cannot run",
        description: "Please save the workflow first",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Running workflow",
        description: "Executing your workflow with live data...",
      });

      const { data, error } = await supabase.functions.invoke('execute-workflow', {
        body: { 
          workflowId,
          testData: null, // Run with live data
        },
      });

      if (error) throw error;

      toast({
        title: "Workflow completed",
        description: `Successfully executed ${data.executionLog.length} steps`,
      });
    } catch (error: any) {
      toast({
        title: "Execution failed",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [workflowId, toast]);

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-muted/30"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <MiniMap 
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger': return 'hsl(var(--primary))';
                case 'action': return 'hsl(var(--accent))';
                case 'condition': return 'hsl(var(--chart-2))';
                default: return 'hsl(var(--muted))';
              }
            }}
            className="bg-card border border-border"
          />
        </ReactFlow>
        
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <Button onClick={handleRun} variant="default" size="sm">
            <Zap className="w-4 h-4 mr-2" />
            Run
          </Button>
          <Button onClick={handleTest} variant="outline" size="sm">
            <Play className="w-4 h-4 mr-2" />
            Test
          </Button>
          <Button onClick={handleSave} size="sm">
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <NodeToolbar onAddNode={addNode} />
      
      {selectedNode && (
        <WorkflowPanel
          node={selectedNode}
          onUpdateNode={updateNodeData}
          onDeleteNode={deleteNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
};