import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toBase64Url = (input: string) => {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// RFC 2047 MIME encode subject for non-ASCII characters
const mimeEncodeSubject = (subject: string) => {
  // Check if subject contains non-ASCII characters
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject; // Pure ASCII, no encoding needed
  }
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(subject)));
  return `=?UTF-8?B?${encoded}?=`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { to, subject, body, integrationId, integrationRowId, leadId, templateId } = await req.json();
    
    console.log('Send email request received:', { to, subject, integrationId, leadId, templateId });

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
    // If integrationRowId is provided, use it directly; otherwise fall back to integration_id match
    let integration;
    let integrationError;

    if (integrationRowId) {
      const result = await supabase
        .from('integrations')
        .select('id, config')
        .eq('id', integrationRowId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      integration = result.data;
      integrationError = result.error;
      console.log('Looking for integration by row ID:', integrationRowId);
    } else {
      const result = await supabase
        .from('integrations')
        .select('id, config')
        .eq('user_id', user.id)
        .eq('integration_id', integrationId || 'google')
        .eq('is_active', true)
        .limit(1)
        .single();
      integration = result.data;
      integrationError = result.error;
      console.log('Looking for integration:', integrationId || 'google', 'for user:', user.id);
    }

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
      const googleClientId = config.clientId || Deno.env.get('GOOGLE_CLIENT_ID');
      const googleClientSecret = config.clientSecret || Deno.env.get('GOOGLE_CLIENT_SECRET');
      
      if (!googleClientId || !googleClientSecret) {
        console.error('Missing Google OAuth credentials for token refresh');
        return new Response(
          JSON.stringify({ error: 'Google OAuth credentials not configured. Please reconnect Gmail.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: googleClientId,
          client_secret: googleClientSecret,
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
          .eq('id', integration.id);
        
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
      // Format body as proper HTML email if it's not already HTML
      const isHtml = body.trim().startsWith('<') && (body.includes('<html') || body.includes('<div') || body.includes('<p') || body.includes('<br'));
      
      // Convert plain text to properly formatted HTML email
      // Check if body contains HTML tags (e.g. signature with images)
      const containsHtml = /<[a-z][\s\S]*>/i.test(body);
      
      let formattedBody: string;
      if (isHtml) {
        formattedBody = body;
      } else if (containsHtml) {
        // Body is mostly plain text but contains HTML (like a signature block)
        // Split at the first HTML tag to separate text from signature
        const firstHtmlIndex = body.search(/<[a-z][\s\S]*>/i);
        const textPart = body.substring(0, firstHtmlIndex);
        const htmlPart = body.substring(firstHtmlIndex);
        
        const textHtml = textPart.split('\n').map((line: string) => line.trim() ? `<p>${line}</p>` : '').join('\n');
        formattedBody = textHtml + '\n' + htmlPart;
      } else {
        formattedBody = body.split('\n').map((line: string) => line.trim() ? `<p>${line}</p>` : '').join('\n');
      }

      const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    p {
      margin: 0 0 10px 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
${formattedBody}
</body>
</html>`;

      // Generate tracking pixel ID
      const trackingPixelId = crypto.randomUUID();
      const trackingPixelUrl = `${supabaseUrl}/functions/v1/track-email-open?id=${trackingPixelId}`;
      const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

      // Inject tracking pixel before closing body tag
      const trackedHtmlBody = htmlBody.replace('</body>', `${trackingPixel}\n</body>`);

      // Send via Gmail API - use MIME encoding for subject to handle special characters
      const emailContent = [
        `To: ${to}`,
        `Subject: ${mimeEncodeSubject(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        trackedHtmlBody
      ].join('\r\n');

      const encodedEmail = toBase64Url(emailContent);

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
        
        // Store failed email in sent_emails table
        await supabase.from('sent_emails').insert({
          user_id: user.id,
          lead_id: leadId || null,
          template_id: templateId || null,
          to_email: to,
          subject: subject,
          body_html: trackedHtmlBody,
          body_text: body,
          status: 'failed',
          sent_at: new Date().toISOString(),
          tracking_pixel_id: trackingPixelId,
        });
        
        if (gmailResponse.status === 401) {
          return new Response(
            JSON.stringify({ error: 'Gmail authentication failed. Please reconnect your Gmail account.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`Failed to send email via Gmail: ${error}`);
      }

      const gmailResult = await gmailResponse.json();
      console.log('Email sent successfully via Gmail. Message ID:', gmailResult.id);

      // Store sent email in sent_emails table
      const { error: insertError } = await supabase.from('sent_emails').insert({
        user_id: user.id,
        lead_id: leadId || null,
        template_id: templateId || null,
        to_email: to,
        subject: subject,
        body_html: trackedHtmlBody,
        body_text: body,
        status: 'sent',
        gmail_message_id: gmailResult.id,
        gmail_thread_id: gmailResult.threadId,
        sent_at: new Date().toISOString(),
        tracking_pixel_id: trackingPixelId,
      });

      if (insertError) {
        console.error('Failed to store sent email:', insertError);
        // Don't fail the request, email was sent successfully
      }

      // Update lead's last_contacted_at if leadId is provided
      if (leadId) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', leadId)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Failed to update lead last_contacted_at:', updateError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          provider: 'gmail',
          messageId: gmailResult.id,
          threadId: gmailResult.threadId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Unsupported email provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error sending email:', error.message);
    
    // Return generic error to client - don't expose internal details
    return new Response(
      JSON.stringify({ error: 'Failed to send email. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
