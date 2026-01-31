import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RelevanceResult {
  score: number;
  isRelevant: boolean;
  reasons: string[];
  requiresReview: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { leadId, sequenceId, targetPersonas } = await req.json();

    if (!leadId) {
      return new Response(JSON.stringify({ error: 'leadId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's subscription plan
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .single();

    const plan = subscription?.plan || 'growth';

    // Growth plan doesn't have relevance filter
    if (plan === 'growth') {
      return new Response(JSON.stringify({
        success: true,
        result: {
          score: 100,
          isRelevant: true,
          reasons: ['Relevance filter not available on Growth plan'],
          requiresReview: false,
        } as RelevanceResult,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reasons: string[] = [];
    let score = 50; // Start at neutral

    // Pro tier: Basic relevance checks (role/title matching)
    const defaultPersonas = targetPersonas || [
      'CEO', 'CTO', 'VP', 'Director', 'Head of', 'Manager', 'Founder', 'Owner'
    ];

    // Check job title match
    if (lead.job_title) {
      const titleLower = lead.job_title.toLowerCase();
      const hasMatchingTitle = defaultPersonas.some((persona: string) => 
        titleLower.includes(persona.toLowerCase())
      );
      
      if (hasMatchingTitle) {
        score += 20;
        reasons.push(`Job title "${lead.job_title}" matches target persona`);
      } else {
        score -= 10;
        reasons.push(`Job title "${lead.job_title}" may not be decision-maker`);
      }
    } else {
      score -= 15;
      reasons.push('No job title available');
    }

    // Check seniority
    if (lead.seniority) {
      const seniorityLower = lead.seniority.toLowerCase();
      if (['c-level', 'vp', 'director', 'owner', 'founder'].includes(seniorityLower)) {
        score += 15;
        reasons.push(`Seniority level "${lead.seniority}" indicates decision-making authority`);
      } else if (['manager', 'senior'].includes(seniorityLower)) {
        score += 5;
        reasons.push(`Seniority level "${lead.seniority}" may influence decisions`);
      }
    }

    // Check email availability
    if (lead.contact_email) {
      score += 10;
      reasons.push('Email available for outreach');
    } else {
      score -= 20;
      reasons.push('No email available');
    }

    // Elite tier: Advanced checks
    if (plan === 'elite') {
      // Check ICP score if available
      if (lead.icp_score !== null && lead.icp_score !== undefined) {
        if (lead.icp_score >= 70) {
          score += 20;
          reasons.push(`High ICP score (${lead.icp_score})`);
        } else if (lead.icp_score >= 40) {
          score += 5;
          reasons.push(`Moderate ICP score (${lead.icp_score})`);
        } else {
          score -= 10;
          reasons.push(`Low ICP score (${lead.icp_score})`);
        }
      }

      // Check engagement history
      const { data: sentEmails } = await supabase
        .from('sent_emails')
        .select('id, opened_at, clicked_at, replied_at')
        .eq('lead_id', leadId)
        .eq('user_id', user.id);

      if (sentEmails && sentEmails.length > 0) {
        const hasEngagement = sentEmails.some(e => e.opened_at || e.clicked_at || e.replied_at);
        if (hasEngagement) {
          score += 15;
          reasons.push('Previous email engagement detected');
        }
      }

      // Check if lead has notes (indicating qualification)
      if (lead.notes && lead.notes.trim().length > 0) {
        score += 5;
        reasons.push('Lead has qualification notes');
      }
    }

    // Normalize score to 0-100
    score = Math.max(0, Math.min(100, score));

    const result: RelevanceResult = {
      score,
      isRelevant: score >= 50,
      reasons,
      requiresReview: score >= 30 && score < 50, // Flag for manual review
    };

    return new Response(JSON.stringify({
      success: true,
      result,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in calculate-relevance-score:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
