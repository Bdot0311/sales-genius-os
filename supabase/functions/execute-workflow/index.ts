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
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { workflowId, testData } = await req.json();
    console.log('Executing workflow:', workflowId);

    const { data: workflow, error: workflowError } = await supabaseClient.from('workflows').select('*').eq('id', workflowId).single();
    if (workflowError) throw workflowError;

    const nodes = workflow.nodes as WorkflowNode[];
    const edges = workflow.edges as WorkflowEdge[];
    console.log('Workflow loaded with', nodes.length, 'nodes');

    const triggerNode = nodes.find(n => n.type === 'trigger');
    if (!triggerNode) throw new Error('No trigger node found');

    const executionLog = [];
    executionLog.push({ nodeId: triggerNode.id, type: 'trigger', status: 'executed', data: testData || {}, timestamp: new Date().toISOString() });

    let currentNodeId = triggerNode.id;
    let workflowData = testData || {};

    while (currentNodeId) {
      const nextEdge = edges.find(e => e.source === currentNodeId);
      if (!nextEdge) break;
      const nextNode = nodes.find(n => n.id === nextEdge.target);
      if (!nextNode) break;

      console.log('Executing node:', nextNode.id, nextNode.type);

      if (nextNode.type === 'action') {
        const actionType = nextNode.data.config?.type;
        
        if (actionType === 'send_email') {
          try {
            const emailConfig = nextNode.data.config?.emailConfig || {};
            const leadEmail = workflowData.contact_email || emailConfig.to;
            const leadName = workflowData.contact_name || 'there';
            
            if (!leadEmail) {
              executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'send_email', status: 'skipped', error: 'No email address available', timestamp: new Date().toISOString() });
            } else {
              const normalizedEmail = leadEmail.toLowerCase().trim();

              // Compliance: skip suppressed and opted-out recipients
              const { data: suppressed } = await serviceClient
                .from('suppressed_emails')
                .select('id')
                .eq('email', normalizedEmail)
                .maybeSingle();

              const { data: optedOut } = await serviceClient
                .from('email_unsubscribe_tokens')
                .select('id')
                .eq('email', normalizedEmail)
                .not('used_at', 'is', null)
                .maybeSingle();

              if (suppressed || optedOut) {
                executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'send_email', status: 'skipped', error: 'Recipient is suppressed or opted out', timestamp: new Date().toISOString() });
              } else {
                const emailBody = emailConfig.body || `<h1>Welcome to OutReign, ${leadName}!</h1><p>Thank you for your interest in our platform.</p><p>Best regards,<br>The OutReign Team</p>`;
                const messageId = crypto.randomUUID();

                await serviceClient.rpc('enqueue_email', {
                  queue_name: 'transactional_emails',
                  payload: {
                    message_id: messageId,
                    to: normalizedEmail,
                    from: `OutReign <noreply@notify.bdotindustries.com>`,
                    sender_domain: 'notify.bdotindustries.com',
                    subject: emailConfig.subject || 'Welcome to OutReign!',
                    html: emailBody,
                    text: emailConfig.subject || 'Welcome to OutReign!',
                    purpose: 'transactional',
                    label: 'workflow-email',
                    idempotency_key: `workflow-${workflowId}-${nextNode.id}-${Date.now()}`,
                    queued_at: new Date().toISOString(),
                  },
                });

                await serviceClient.from('email_send_log').insert({ message_id: messageId, template_name: 'workflow-email', recipient_email: normalizedEmail, status: 'pending' });

                console.log('Email enqueued successfully');
                executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'send_email', status: 'executed', to: normalizedEmail, timestamp: new Date().toISOString() });
              }
            }
          } catch (error: any) {
            console.error('Failed to send email:', error);
            executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'send_email', status: 'failed', error: error.message, timestamp: new Date().toISOString() });
          }
        } else if (actionType === 'create_task') {
          try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
              const taskConfig = nextNode.data.config?.taskConfig || {};
              const { error: taskError } = await supabaseClient.from('activities').insert({
                user_id: user.id, lead_id: workflowData.id, type: 'task',
                subject: taskConfig.subject || 'Follow up with lead',
                description: taskConfig.description || '',
                due_date: taskConfig.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });
              if (taskError) throw taskError;
              executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'create_task', status: 'executed', timestamp: new Date().toISOString() });
            } else {
              executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'create_task', status: 'skipped', error: 'No authenticated user', timestamp: new Date().toISOString() });
            }
          } catch (error: any) {
            executionLog.push({ nodeId: nextNode.id, type: 'action', action: 'create_task', status: 'failed', error: error.message, timestamp: new Date().toISOString() });
          }
        }
      } else if (nextNode.type === 'condition') {
        executionLog.push({ nodeId: nextNode.id, type: 'condition', condition: nextNode.data.config?.type, status: 'evaluated', result: true, timestamp: new Date().toISOString() });
      }

      currentNodeId = nextNode.id;
    }

    console.log('Workflow execution completed');
    return new Response(JSON.stringify({ success: true, workflowId, executionLog, message: 'Workflow executed successfully' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error executing workflow:', errorMessage);
    return new Response(JSON.stringify({ error: 'Workflow execution failed. Please try again.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
});
