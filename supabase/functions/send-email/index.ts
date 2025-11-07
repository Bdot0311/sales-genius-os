import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { to, subject, body, integrationId } = await req.json();
    
    console.log('Send email request received:', { to, subject, integrationId });

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      throw new Error('No authorization header');
    }

    console.log('Auth header present, extracting user...');

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    console.log('User extraction result:', { 
      hasUser: !!user, 
      userId: user?.id,
      userError: userError?.message 
    });
    
    if (userError || !user) {
      console.error('User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: `Authentication failed: ${userError?.message || 'No user found'}` }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the integration config for this user
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('integration_id', integrationId || 'google')
      .eq('is_active', true)
      .single();

    console.log('Looking for integration:', integrationId || 'google', 'for user:', user.id);
    console.log('Integration found:', integration ? 'yes' : 'no');
    
    if (integrationError || !integration) {
      console.error('Integration error:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Google integration not found or not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = integration.config as any;
    console.log('Config keys:', Object.keys(config));
    
    // Get access token based on provider
    let accessToken = config.accessToken || config.provider_token;
    
    // Check if token needs refresh (for Google)
    if ((integrationId === 'google' || !integrationId) && config.expiresAt && Date.now() >= config.expiresAt && config.refreshToken) {
      console.log('Token expired, refreshing...');
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (tokenResponse.ok) {
        const tokens = await tokenResponse.json();
        accessToken = tokens.access_token;
        
        // Update tokens in database
        await supabase
          .from('integrations')
          .update({
            config: {
              ...config,
              accessToken: tokens.access_token,
              expiresAt: Date.now() + tokens.expires_in * 1000,
            },
          })
          .eq('user_id', user.id)
          .eq('integration_id', integrationId || 'google');
        
        console.log('Token refreshed successfully');
      } else {
        console.error('Failed to refresh token');
        return new Response(
          JSON.stringify({ error: 'Failed to refresh access token. Please reconnect Gmail.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!accessToken) {
      console.error('No access token found. Config has:', Object.keys(config));
      return new Response(
        JSON.stringify({ error: 'Gmail is not properly connected. Please go to Integrations page, disconnect Gmail, then click "Connect" to set it up with OAuth.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email based on integration type
    if (integrationId === 'google' || !integrationId) {
      // Send via Gmail API
      const emailContent = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        body
      ].join('\n');

      const encodedEmail = btoa(emailContent)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      console.log('Sending email via Gmail to:', to);
      
      const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      });

      if (!gmailResponse.ok) {
        const error = await gmailResponse.text();
        console.error('Gmail API error:', gmailResponse.status, error);
        
        if (gmailResponse.status === 401) {
          return new Response(
            JSON.stringify({ error: 'Gmail authentication failed. Please reconnect your Gmail account.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`Failed to send email via Gmail: ${error}`);
      }

      console.log('Email sent successfully via Gmail');

      return new Response(
        JSON.stringify({ success: true, provider: 'gmail' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Unsupported email provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error sending email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
