import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  console.log(`[check-rate-limit] ${step}`, details || '');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Starting rate limit check');

    // Security: Validate authorization - this function can be called by authenticated users or internal services
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    
    // Parse request body first to get apiKeyId and check for internal calls
    const { apiKeyId, endpoint = 'default', internalCall = false } = await req.json();
    logStep('Request data', { apiKeyId, endpoint, internalCall });

    if (!apiKeyId) {
      return new Response(
        JSON.stringify({ error: 'API key ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    let userId: string | null = null;

    // Check if this is an internal service call (using service role key)
    if (token === supabaseKey && internalCall) {
      logStep('Internal service call detected');
      // For internal calls, we trust the apiKeyId and just fetch the key directly
      const { data: apiKey, error: keyError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('id', apiKeyId)
        .eq('is_active', true)
        .single();

      if (keyError || !apiKey) {
        return new Response(
          JSON.stringify({ error: 'API key not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      userId = apiKey.user_id;
    } else {
      // Regular user authentication
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !userData.user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization token' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      userId = userData.user.id;
      logStep('User authenticated', { userId });
    }

    // Get API key configuration
    let apiKeyQuery = supabase.from('api_keys').select('*').eq('id', apiKeyId);
    
    // For non-internal calls, ensure user owns this key
    if (!internalCall || token !== supabaseKey) {
      apiKeyQuery = apiKeyQuery.eq('user_id', userId);
    }

    const { data: apiKey, error: keyError } = await apiKeyQuery.single();

    if (keyError || !apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not found or access denied' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (!apiKey.is_active) {
      return new Response(
        JSON.stringify({ allowed: false, reason: 'API key is inactive' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Check if key is expired
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ allowed: false, reason: 'API key has expired' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get endpoint-specific rate limit or use default
    const endpointLimits = apiKey.endpoint_rate_limits || {};
    const tokensPerMinute = endpointLimits[endpoint]?.per_minute || apiKey.rate_limit_per_minute;
    const tokensPerDay = endpointLimits[endpoint]?.per_day || apiKey.rate_limit_per_day;

    // Token bucket algorithm - refill rate
    const refillRate = tokensPerMinute / 60; // tokens per second
    const bucketCapacity = tokensPerMinute;

    // Get or create bucket for this endpoint
    const { data: bucket, error: bucketError } = await supabase
      .from('rate_limit_buckets')
      .select('*')
      .eq('api_key_id', apiKeyId)
      .eq('endpoint', endpoint)
      .single();

    let currentTokens: number;
    const now = new Date();

    if (bucketError || !bucket) {
      // Create new bucket
      logStep('Creating new rate limit bucket');
      const { error: insertError } = await supabase
        .from('rate_limit_buckets')
        .insert({
          api_key_id: apiKeyId,
          endpoint,
          tokens: bucketCapacity - 1, // Consume 1 token
          last_refill_at: now.toISOString(),
        });

      if (insertError) throw insertError;

      return new Response(
        JSON.stringify({
          allowed: true,
          tokensRemaining: bucketCapacity - 1,
          resetAt: new Date(now.getTime() + 60000).toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate tokens to add based on time elapsed
    const lastRefill = new Date(bucket.last_refill_at);
    const secondsElapsed = (now.getTime() - lastRefill.getTime()) / 1000;
    const tokensToAdd = secondsElapsed * refillRate;
    currentTokens = Math.min(parseFloat(bucket.tokens) + tokensToAdd, bucketCapacity);

    logStep('Token calculation', {
      secondsElapsed,
      tokensToAdd,
      currentTokens,
      bucketCapacity,
    });

    // Check if we have tokens available
    if (currentTokens < 1) {
      const resetTime = new Date(now.getTime() + ((1 - currentTokens) / refillRate) * 1000);
      
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: 'Rate limit exceeded',
          resetAt: resetTime.toISOString(),
          tokensRemaining: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Consume 1 token
    const newTokenCount = currentTokens - 1;
    const { error: updateError } = await supabase
      .from('rate_limit_buckets')
      .update({
        tokens: newTokenCount,
        last_refill_at: now.toISOString(),
      })
      .eq('id', bucket.id);

    if (updateError) throw updateError;

    // Update API key stats
    await supabase
      .from('api_keys')
      .update({
        last_used_at: now.toISOString(),
        total_requests: apiKey.total_requests + 1,
      })
      .eq('id', apiKeyId);

    // Check if approaching daily limit (80%)
    const dailyUsagePercent = (apiKey.total_requests / tokensPerDay) * 100;
    if (dailyUsagePercent >= 80 && dailyUsagePercent < 100) {
      // Trigger alert (could be done via separate edge function)
      logStep('Approaching daily rate limit', { dailyUsagePercent });
    }

    const resetTime = new Date(now.getTime() + ((bucketCapacity - newTokenCount) / refillRate) * 1000);

    return new Response(
      JSON.stringify({
        allowed: true,
        tokensRemaining: Math.floor(newTokenCount),
        resetAt: resetTime.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('Error', errorMessage);
    // Security: Don't expose internal error details
    return new Response(
      JSON.stringify({ error: 'Rate limit check failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
