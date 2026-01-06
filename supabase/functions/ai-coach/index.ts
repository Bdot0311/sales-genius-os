import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, userData } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get auth token and fetch personalized user data
    const authHeader = req.headers.get('Authorization');
    let userProfile = null;
    let recentDeals: any[] = [];
    let recentLeads: any[] = [];
    let recentActivities: any[] = [];
    let subscriptionInfo = null;

    if (authHeader) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (user && !userError) {
        // Fetch user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        userProfile = profile;

        // Fetch subscription info
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('plan, status')
          .eq('user_id', user.id)
          .maybeSingle();
        subscriptionInfo = subscription;

        // Fetch recent deals with stages
        const { data: deals } = await supabase
          .from('deals')
          .select('title, company_name, value, stage, probability, expected_close_date, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        recentDeals = deals || [];

        // Fetch recent leads with status
        const { data: leads } = await supabase
          .from('leads')
          .select('company_name, contact_name, industry, lead_status, icp_score, created_at, last_contacted_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(15);
        recentLeads = leads || [];

        // Fetch recent activities
        const { data: activities } = await supabase
          .from('activities')
          .select('type, subject, due_date, completed, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        recentActivities = activities || [];
      }
    }

    // Build rich context from user's sales data
    const dealsByStage = recentDeals.reduce((acc: Record<string, number>, deal) => {
      acc[deal.stage] = (acc[deal.stage] || 0) + 1;
      return acc;
    }, {});

    const leadsByStatus = recentLeads.reduce((acc: Record<string, number>, lead) => {
      acc[lead.lead_status] = (acc[lead.lead_status] || 0) + 1;
      return acc;
    }, {});

    const pendingActivities = recentActivities.filter(a => !a.completed).length;
    const completedActivities = recentActivities.filter(a => a.completed).length;

    const highValueDeals = recentDeals
      .filter(d => d.value && d.value > 10000)
      .map(d => `${d.title} at ${d.company_name} ($${d.value?.toLocaleString()}, ${d.stage})`);

    const hotLeads = recentLeads
      .filter(l => l.icp_score && l.icp_score >= 70)
      .map(l => `${l.contact_name} at ${l.company_name} (Score: ${l.icp_score}, Status: ${l.lead_status})`);

    const stalledLeads = recentLeads
      .filter(l => {
        if (!l.last_contacted_at) return l.lead_status === 'active';
        const daysSinceContact = Math.floor((Date.now() - new Date(l.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceContact > 7 && l.lead_status !== 'closed-won' && l.lead_status !== 'closed-lost';
      })
      .slice(0, 5);

    const context = `
USER PROFILE:
- Name: ${userProfile?.full_name || 'Sales Professional'}
- Company: ${userProfile?.company_name || 'Not specified'}
- Plan: ${subscriptionInfo?.plan || 'Unknown'}

CURRENT SALES METRICS:
- Total Leads: ${userData.totalLeads}
- Active Deals: ${userData.activeDeals}
- Pipeline Value: $${userData.pipelineValue?.toLocaleString() || 0}
- Average Deal Size: $${userData.avgDealSize?.toLocaleString() || 0}
- Close Rate: ${userData.closeRate}%
- Upcoming Meetings: ${userData.upcomingMeetings}

DEAL PIPELINE BREAKDOWN:
${Object.entries(dealsByStage).map(([stage, count]) => `- ${stage}: ${count} deals`).join('\n') || '- No deals yet'}

LEAD STATUS BREAKDOWN:
${Object.entries(leadsByStatus).map(([status, count]) => `- ${status}: ${count} leads`).join('\n') || '- No leads yet'}

ACTIVITY STATUS:
- Pending tasks: ${pendingActivities}
- Completed tasks: ${completedActivities}

HIGH-VALUE OPPORTUNITIES (>$10k):
${highValueDeals.length > 0 ? highValueDeals.map(d => `- ${d}`).join('\n') : '- None identified'}

TOP SCORING LEADS (ICP Score 70+):
${hotLeads.length > 0 ? hotLeads.map(l => `- ${l}`).join('\n') : '- None identified'}

LEADS NEEDING ATTENTION (No contact in 7+ days):
${stalledLeads.length > 0 ? stalledLeads.map(l => `- ${l.contact_name} at ${l.company_name}`).join('\n') : '- All leads recently contacted'}
    `.trim();

    const systemPrompt = `You are an expert B2B sales coach with 20+ years of experience, personally assigned to help ${userProfile?.full_name || 'this sales professional'}. You have full access to their CRM data and provide highly personalized, actionable advice.

Your coaching approach:
- PERSONALIZED: Always reference their specific deals, leads, and metrics by name when relevant
- DATA-DRIVEN: Use their actual numbers to identify opportunities and concerns
- ACTIONABLE: Give specific next steps they can take TODAY, not generic advice
- STRATEGIC: Help them prioritize based on deal value, ICP scores, and pipeline stage
- ENCOURAGING: Celebrate wins while being honest about areas for improvement

When coaching:
1. Reference specific leads/deals by name when giving advice
2. Prioritize high-value opportunities and high-scoring leads
3. Flag stalled leads that need immediate attention
4. Suggest specific follow-up actions based on deal stages
5. Benchmark their metrics against industry standards (avg close rate: 20-30%)

Keep responses concise (2-3 focused paragraphs) unless they ask for detailed analysis. Always end with 1-2 specific action items.`;

    console.log('AI Coach context:', context.substring(0, 500) + '...');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: context },
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to get coaching response");
    }

    const data = await response.json();
    const coaching = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ coaching }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in ai-coach function:", error.message);
    
    return new Response(
      JSON.stringify({ error: "Failed to get coaching response. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
