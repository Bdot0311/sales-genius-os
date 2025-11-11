import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-api-version',
};

const logStep = (step: string, details?: any) => {
  console.log(`[graphql-api] ${step}`, details || '');
};

// Simple GraphQL resolver
const resolvers: Record<string, (args: any, supabase: any, userId: string) => Promise<any>> = {
  leads: async (args: any, supabase: any, userId: string) => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data;
  },
  deals: async (args: any, supabase: any, userId: string) => {
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data;
  },
  activities: async (args: any, supabase: any, userId: string) => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data;
  },
};

// Simple GraphQL query parser
const parseGraphQLQuery = (query: string) => {
  const match = query.match(/(\w+)\s*(?:\((.*?)\))?\s*\{([\s\S]*?)\}/);
  if (!match) throw new Error('Invalid GraphQL query');
  
  const [, operation, argsStr, fields] = match;
  
  let args: Record<string, any> = {};
  if (argsStr) {
    // Very basic argument parsing
    const argMatches = argsStr.matchAll(/(\w+):\s*({[^}]+}|"[^"]*"|\d+)/g);
    for (const [, key, value] of argMatches) {
      try {
        args[key] = JSON.parse(value.replace(/(\w+):/g, '"$1":'));
      } catch {
        args[key] = value.replace(/"/g, '');
      }
    }
  }
  
  return { operation, args, fields: fields.trim() };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('GraphQL API request received');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for API key authentication
    const apiKey = req.headers.get('X-API-Key');
    const apiVersion = req.headers.get('X-API-Version') || 'v1';
    
    if (!apiKey) {
      throw new Error('API key required');
    }

    // Validate API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*, api_versions!inner(*)')
      .eq('key', apiKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = keyData.user_id;

    // Check rate limit
    const rateLimitResponse = await fetch(`${supabaseUrl}/functions/v1/check-rate-limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        apiKeyId: keyData.id,
        endpoint: 'graphql',
      }),
    });

    const rateLimitData = await rateLimitResponse.json();
    
    if (!rateLimitData.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimitData.resetAt,
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitData.resetAt,
          }, 
          status: 429 
        }
      );
    }

    // Check cache if enabled
    let cachedResult = null;
    if (keyData.enable_caching) {
      const requestBody = await req.text();
      const cacheKey = `graphql:${apiKey}:${requestBody}`;
      
      const { data: cacheData } = await supabase
        .from('api_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (cacheData) {
        logStep('Cache hit', { cacheKey });
        cachedResult = cacheData.cache_value;
      }
    }

    if (cachedResult) {
      return new Response(
        JSON.stringify({
          data: cachedResult,
          cached: true,
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            'X-RateLimit-Remaining': rateLimitData.tokensRemaining.toString(),
          } 
        }
      );
    }

    // Parse GraphQL query
    const { query } = await req.json();
    const { operation, args } = parseGraphQLQuery(query);
    
    logStep('Executing GraphQL query', { operation, args });

    // Execute resolver
    if (!resolvers[operation]) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    const result = await resolvers[operation](args, supabase, userId);

    // Cache result if enabled
    if (keyData.enable_caching) {
      const requestBody = JSON.stringify({ query });
      const cacheKey = `graphql:${apiKey}:${requestBody}`;
      const ttl = keyData.cache_ttl_seconds || 300;
      
      await supabase.from('api_cache').insert({
        cache_key: cacheKey,
        cache_value: result,
        ttl_seconds: ttl,
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      });
    }

    // Log API usage
    await supabase.from('api_usage_log').insert({
      api_key_id: keyData.id,
      endpoint: '/graphql',
      method: 'POST',
      status_code: 200,
      response_time_ms: 0,
    });

    return new Response(
      JSON.stringify({ data: result }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'X-RateLimit-Remaining': rateLimitData.tokensRemaining.toString(),
          'X-API-Version': apiVersion,
        } 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('Error', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
