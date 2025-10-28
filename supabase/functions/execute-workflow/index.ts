import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';
import { Resend } from 'npm:resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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
          try {
            // Get email configuration from node
            const emailConfig = nextNode.data.config?.emailConfig || {};
            const leadEmail = workflowData.contact_email || emailConfig.to;
            const leadName = workflowData.contact_name || 'there';
            
            if (!leadEmail) {
              console.warn('No email address found for send_email action');
              executionLog.push({
                nodeId: nextNode.id,
                type: 'action',
                action: 'send_email',
                status: 'skipped',
                error: 'No email address available',
                timestamp: new Date().toISOString(),
              });
            } else {
              // Send actual email using Resend
              const emailResponse = await resend.emails.send({
                from: 'SalesOS <onboarding@resend.dev>',
                to: [leadEmail],
                subject: emailConfig.subject || 'Welcome to SalesOS!',
                html: emailConfig.body || `
                  <h1>Welcome to SalesOS, ${leadName}!</h1>
                  <p>Thank you for your interest in our platform.</p>
                  <p>We're excited to help you streamline your sales process.</p>
                  <p>Best regards,<br>The SalesOS Team</p>
                `,
              });

              console.log('Email sent successfully:', emailResponse);

              executionLog.push({
                nodeId: nextNode.id,
                type: 'action',
                action: 'send_email',
                status: 'executed',
                emailId: emailResponse.id,
                to: leadEmail,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (error: any) {
            console.error('Failed to send email:', error);
            executionLog.push({
              nodeId: nextNode.id,
              type: 'action',
              action: 'send_email',
              status: 'failed',
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
        } else if (actionType === 'create_task') {
          try {
            // Get user_id from auth header
            const authHeader = req.headers.get('Authorization');
            if (authHeader) {
              const { data: { user } } = await supabaseClient.auth.getUser();
              
              if (user) {
                // Create actual task in activities table
                const taskConfig = nextNode.data.config?.taskConfig || {};
                const { error: taskError } = await supabaseClient
                  .from('activities')
                  .insert({
                    user_id: user.id,
                    lead_id: workflowData.id,
                    type: 'task',
                    subject: taskConfig.subject || 'Follow up with lead',
                    description: taskConfig.description || '',
                    due_date: taskConfig.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  });

                if (taskError) throw taskError;

                executionLog.push({
                  nodeId: nextNode.id,
                  type: 'action',
                  action: 'create_task',
                  status: 'executed',
                  timestamp: new Date().toISOString(),
                });
              }
            } else {
              executionLog.push({
                nodeId: nextNode.id,
                type: 'action',
                action: 'create_task',
                status: 'skipped',
                error: 'No authenticated user',
                timestamp: new Date().toISOString(),
              });
            }
          } catch (error: any) {
            console.error('Failed to create task:', error);
            executionLog.push({
              nodeId: nextNode.id,
              type: 'action',
              action: 'create_task',
              status: 'failed',
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          }
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
