import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label: string;
    config?: {
      type?: string;
      [key: string]: any;
    };
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { workflowId, testData } = await req.json();

    console.log('Executing workflow:', workflowId);

    // Fetch workflow
    const { data: workflow, error: workflowError } = await supabaseClient
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError) throw workflowError;

    const nodes = workflow.nodes as WorkflowNode[];
    const edges = workflow.edges as WorkflowEdge[];

    console.log('Workflow loaded with', nodes.length, 'nodes');

    // Find trigger node
    const triggerNode = nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
      throw new Error('No trigger node found');
    }

    const executionLog = [];
    executionLog.push({
      nodeId: triggerNode.id,
      type: 'trigger',
      status: 'executed',
      data: testData || {},
      timestamp: new Date().toISOString(),
    });

    // Execute workflow by following edges from trigger
    let currentNodeId = triggerNode.id;
    let workflowData = testData || {};

    while (currentNodeId) {
      const nextEdge = edges.find(e => e.source === currentNodeId);
      if (!nextEdge) break;

      const nextNode = nodes.find(n => n.id === nextEdge.target);
      if (!nextNode) break;

      console.log('Executing node:', nextNode.id, nextNode.type);

      // Execute node based on type
      if (nextNode.type === 'action') {
        const actionType = nextNode.data.config?.type;
        
        if (actionType === 'send_email') {
          executionLog.push({
            nodeId: nextNode.id,
            type: 'action',
            action: 'send_email',
            status: 'executed',
            timestamp: new Date().toISOString(),
          });
        } else if (actionType === 'create_task') {
          executionLog.push({
            nodeId: nextNode.id,
            type: 'action',
            action: 'create_task',
            status: 'executed',
            timestamp: new Date().toISOString(),
          });
        }
      } else if (nextNode.type === 'condition') {
        const conditionType = nextNode.data.config?.type;
        executionLog.push({
          nodeId: nextNode.id,
          type: 'condition',
          condition: conditionType,
          status: 'evaluated',
          result: true,
          timestamp: new Date().toISOString(),
        });
      }

      currentNodeId = nextNode.id;
    }

    console.log('Workflow execution completed');

    return new Response(
      JSON.stringify({
        success: true,
        workflowId,
        executionLog,
        message: 'Workflow executed successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error executing workflow:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
