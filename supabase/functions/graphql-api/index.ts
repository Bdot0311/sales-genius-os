import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-api-version',
};

const logStep = (step: string, details?: any) => {
  console.log(`[graphql-api] ${step}`, details || '');
};

// Security: Maximum query length to prevent ReDoS attacks
const MAX_QUERY_LENGTH = 10000;
const MAX_QUERY_DEPTH = 5;
const ALLOWED_OPERATIONS = ['leads', 'deals', 'activities'];

// Secure resolvers with proper scoping and limits
const resolvers: Record<string, (args: any, supabase: any, userId: string) => Promise<any>> = {
  leads: async (args: any, supabase: any, userId: string) => {
    let query = supabase.from('leads').select('*').eq('user_id', userId);
    if (args.limit) query = query.limit(Math.min(parseInt(args.limit), 100)); // Cap at 100
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  deals: async (args: any, supabase: any, userId: string) => {
    let query = supabase.from('deals').select('*').eq('user_id', userId);
    if (args.limit) query = query.limit(Math.min(parseInt(args.limit), 100));
    if (args.stage) query = query.eq('stage', String(args.stage).substring(0, 50));
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  activities: async (args: any, supabase: any, userId: string) => {
    let query = supabase.from('activities').select('*').eq('user_id', userId);
    if (args.limit) query = query.limit(Math.min(parseInt(args.limit), 100));
    if (args.type) query = query.eq('type', String(args.type).substring(0, 50));
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
};

// Secure GraphQL query parser with validation
const parseGraphQLQuery = (query: string): { operation: string; args: Record<string, any>; fields: string } | null => {
  // Security: Validate query length
  if (!query || typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
    logStep('Query validation failed: too long or invalid type');
    return null;
  }

  // Security: Basic structure validation
  const trimmedQuery = query.trim();
  if (!trimmedQuery.match(/^(query\s*\{|mutation\s*\{|\{|\w+\s*(\(|{))/i)) {
    logStep('Query validation failed: invalid structure');
    return null;
  }

  // Security: Check for nested depth (prevent deeply nested queries)
  const braceDepth = (trimmedQuery.match(/{/g) || []).length;
  if (braceDepth > MAX_QUERY_DEPTH) {
    logStep('Query validation failed: too deeply nested');
    return null;
  }

  const match = query.match(/(\w+)\s*(?:\((.*?)\))?\s*\{([\s\S]*?)\}/);
  if (!match) {
    logStep('Query parsing failed: no match');
    return null;
  }
  
  const [, operation, argsStr, fields] = match;
  
  // Security: Validate operation is allowed
  if (!ALLOWED_OPERATIONS.includes(operation.toLowerCase())) {
    logStep('Query validation failed: operation not allowed', { operation });
    return null;
  }
  
  let args: Record<string, any> = {};
  if (argsStr) {
    // Security: Limit argument parsing
    const argMatches = argsStr.matchAll(/(\w+):\s*({[^}]+}|"[^"]*"|\d+)/g);
    let argCount = 0;
    for (const [, key, value] of argMatches) {
      if (argCount >= 10) break; // Limit number of arguments
      
      // Security: Validate key format
      if (!/^[\w]+$/.test(key)) continue;
      
      try {
        args[key] = JSON.parse(value.replace(/(\w+):/g, '"$1":'));
      } catch {
        // Security: Sanitize string values
        args[key] = value.replace(/"/g, '').substring(0, 100);
      }
      argCount++;
    }
  }
  
  return { operation: operation.toLowerCase(), args, fields: fields.trim() };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    logStep('GraphQL API request received');

    // Security: Check content length
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_QUERY_LENGTH) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Request body too large' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 413 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for API key authentication
    const apiKey = req.headers.get('X-API-Key');
    const apiVersion = req.headers.get('X-API-Version') || 'v1';
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'API key required' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Validate API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', apiKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Invalid API key' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Security: Check if key is expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'API key has expired' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = keyData.user_id;

    // Check rate limit using internal service call
    const rateLimitResponse = await fetch(`${supabaseUrl}/functions/v1/check-rate-limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        apiKeyId: keyData.id,
        endpoint: 'graphql',
        internalCall: true, // Flag for internal service calls
      }),
    });

    const rateLimitData = await rateLimitResponse.json();
    
    if (!rateLimitData.allowed) {
      return new Response(
        JSON.stringify({
          errors: [{ message: 'Rate limit exceeded' }],
          extensions: { resetAt: rateLimitData.resetAt }
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

    // Parse request body
    const body = await req.json();
    const { query } = body;

    if (!query) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Query is required' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check cache if enabled
    let cachedResult = null;
    // Create a simple hash for cache key using btoa (base64 encoding in Deno)
    const queryHash = btoa(query).substring(0, 100);
    const cacheKey = keyData.enable_caching ? `graphql:${keyData.id}:${queryHash}` : null;
    
    if (keyData.enable_caching && cacheKey) {
      const { data: cacheData } = await supabase
        .from('api_cache')
        .select('cache_value')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (cacheData) {
        logStep('Cache hit');
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
            'X-RateLimit-Remaining': String(rateLimitData.tokensRemaining),
          } 
        }
      );
    }

    // Parse GraphQL query with security validation
    const parsed = parseGraphQLQuery(query);
    if (!parsed) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'Invalid query format or disallowed operation' }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { operation, args } = parsed;
    logStep('Executing GraphQL query', { operation });

    // Execute resolver
    const resolver = resolvers[operation];
    if (!resolver) {
      return new Response(
        JSON.stringify({ errors: [{ message: `Unknown operation: ${operation}` }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const result = await resolver(args, supabase, userId);

    // Cache result if enabled
    if (keyData.enable_caching && cacheKey) {
      const ttl = keyData.cache_ttl_seconds || 300;
      
      await supabase.from('api_cache').upsert({
        cache_key: cacheKey,
        cache_value: result,
        ttl_seconds: ttl,
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      }, { onConflict: 'cache_key' });
    }

    const responseTime = Date.now() - startTime;

    // Log API usage
    await supabase.from('api_usage_log').insert({
      api_key_id: keyData.id,
      endpoint: '/graphql',
      method: 'POST',
      status_code: 200,
      response_time_ms: responseTime,
    });

    return new Response(
      JSON.stringify({ 
        data: { [operation]: result },
        extensions: {
          responseTime,
          rateLimit: {
            tokensRemaining: rateLimitData.tokensRemaining,
            resetAt: rateLimitData.resetAt
          }
        }
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'X-RateLimit-Remaining': String(rateLimitData.tokensRemaining),
          'X-API-Version': apiVersion,
        } 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('Error', errorMessage);
    // Security: Don't expose internal error details
    return new Response(
      JSON.stringify({ errors: [{ message: 'Internal server error' }] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
