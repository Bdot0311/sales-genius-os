import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const log = (step: string, details?: any) => {
  console.log(`[rest-api] ${step}`, details || '');
};

// ── Input validation helpers ──────────────────────────────────────────
const MAX_STRING = 500;
const MAX_BULK = 100;

const sanitize = (v: unknown, max = MAX_STRING): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > max ? s.substring(0, max) : s;
};

const safeInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = parseInt(String(v), 10);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

// ── Auth: validate API key ────────────────────────────────────────────
async function authenticateApiKey(req: Request, supabase: any) {
  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey) return { error: 'API key required via X-API-Key header', status: 401 };

  const { data: keyData, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key', apiKey)
    .eq('is_active', true)
    .single();

  if (error || !keyData) return { error: 'Invalid API key', status: 401 };
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { error: 'API key has expired', status: 401 };
  }
  return { keyData };
}

// ── Rate limiting ─────────────────────────────────────────────────────
async function checkRateLimit(supabaseUrl: string, serviceKey: string, apiKeyId: string, endpoint: string) {
  const res = await fetch(`${supabaseUrl}/functions/v1/check-rate-limit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ apiKeyId, endpoint, internalCall: true }),
  });
  return res.json();
}

// ── Usage logging ─────────────────────────────────────────────────────
async function logUsage(supabase: any, apiKeyId: string, endpoint: string, method: string, statusCode: number, responseTimeMs: number) {
  await supabase.from('api_usage_log').insert({
    api_key_id: apiKeyId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
  });
}

// ── Route parser ──────────────────────────────────────────────────────
function parseRoute(url: URL): { resource: string; id?: string; action?: string } {
  // Path after /rest-api/  e.g. /rest-api/leads/abc/enrich
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);
  // parts: ["rest-api", "leads", "abc", "enrich"] or ["rest-api", "leads"]
  const idx = parts.indexOf('rest-api');
  const rest = parts.slice(idx + 1);
  return {
    resource: rest[0] || '',
    id: rest.length >= 2 && rest[1] !== 'bulk' ? rest[1] : undefined,
    action: rest.length >= 3 ? rest[2] : (rest[1] === 'bulk' ? 'bulk' : undefined),
  };
}

// ── Lead validation ───────────────────────────────────────────────────
function validateLead(body: any): { data: any; error?: string } {
  const contact_name = sanitize(body.contact_name);
  const company_name = sanitize(body.company_name);
  if (!contact_name || !company_name) return { data: null, error: 'contact_name and company_name are required' };

  return {
    data: {
      contact_name,
      company_name,
      contact_email: sanitize(body.contact_email, 255),
      contact_phone: sanitize(body.contact_phone, 50),
      industry: sanitize(body.industry, 100),
      company_size: sanitize(body.company_size, 50),
      source: sanitize(body.source, 100),
      notes: sanitize(body.notes, 2000),
      linkedin_url: sanitize(body.linkedin_url, 500),
      job_title: sanitize(body.job_title, 200),
      department: sanitize(body.department, 100),
      seniority: sanitize(body.seniority, 50),
      company_website: sanitize(body.company_website, 500),
      company_linkedin: sanitize(body.company_linkedin, 500),
      company_description: sanitize(body.company_description, 2000),
      employee_count: sanitize(body.employee_count, 50),
      annual_revenue: sanitize(body.annual_revenue, 100),
      lead_status: sanitize(body.lead_status, 50) || 'active',
      engagement_state: sanitize(body.engagement_state, 50) || 'new',
    },
  };
}

function validateDeal(body: any): { data: any; error?: string } {
  const title = sanitize(body.title);
  const company_name = sanitize(body.company_name);
  if (!title || !company_name) return { data: null, error: 'title and company_name are required' };

  return {
    data: {
      title,
      company_name,
      contact_name: sanitize(body.contact_name),
      stage: sanitize(body.stage, 50) || 'new',
      value: body.value != null ? Number(body.value) || 0 : null,
      probability: body.probability != null ? safeInt(body.probability, 0, 0, 100) : 0,
      expected_close_date: sanitize(body.expected_close_date, 20),
      notes: sanitize(body.notes, 2000),
      lead_id: sanitize(body.lead_id, 36),
    },
  };
}

function validateActivity(body: any): { data: any; error?: string } {
  const subject = sanitize(body.subject);
  const type = sanitize(body.type, 50);
  if (!subject || !type) return { data: null, error: 'subject and type are required' };

  return {
    data: {
      subject,
      type,
      description: sanitize(body.description, 2000),
      completed: body.completed === true,
      due_date: sanitize(body.due_date, 30),
      deal_id: sanitize(body.deal_id, 36),
      lead_id: sanitize(body.lead_id, 36),
    },
  };
}

function validateContact(body: any): { data: any; error?: string } {
  if (!body.first_name && !body.last_name && !body.email) {
    return { data: null, error: 'At least first_name, last_name, or email is required' };
  }

  return {
    data: {
      first_name: sanitize(body.first_name, 100),
      last_name: sanitize(body.last_name, 100),
      email: sanitize(body.email, 255),
      job_title: sanitize(body.job_title, 200),
      department: sanitize(body.department, 100),
      seniority: sanitize(body.seniority, 50),
      linkedin_url: sanitize(body.linkedin_url, 500),
      city: sanitize(body.city, 100),
      country: sanitize(body.country, 100),
      source: sanitize(body.source, 100),
      lead_status: sanitize(body.lead_status, 50) || 'discovered',
      company_id: sanitize(body.company_id, 36),
    },
  };
}

// ── CRUD helpers ──────────────────────────────────────────────────────
async function handleList(supabase: any, table: string, userId: string, params: URLSearchParams, filters?: Record<string, string>) {
  const limit = safeInt(params.get('limit'), 50, 1, 100);
  const offset = safeInt(params.get('offset'), 0, 0, 100000);

  let query = supabase.from(table).select('*', { count: 'exact' }).eq('user_id', userId);

  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      if (val) query = query.eq(col, val);
    }
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count, limit, offset };
}

async function handleGet(supabase: any, table: string, userId: string, id: string) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).eq('user_id', userId).single();
  if (error) return { error: 'Not found', status: 404 };
  return { data };
}

async function handleCreate(supabase: any, table: string, userId: string, record: any) {
  const { data, error } = await supabase.from(table).insert({ ...record, user_id: userId }).select().single();
  if (error) throw error;
  return { data, status: 201 };
}

async function handleUpdate(supabase: any, table: string, userId: string, id: string, updates: any) {
  // Remove null values so we only update provided fields
  const cleaned: any = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) cleaned[k] = v;
  }
  const { data, error } = await supabase.from(table).update(cleaned).eq('id', id).eq('user_id', userId).select().single();
  if (error) return { error: 'Not found or update failed', status: 404 };
  return { data };
}

async function handleDelete(supabase: any, table: string, userId: string, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId);
  if (error) return { error: 'Not found or delete failed', status: 404 };
  return { data: { deleted: true } };
}

// ── Main handler ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const url = new URL(req.url);
  const method = req.method;
  const { resource, id, action } = parseRoute(url);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const respond = (body: any, status = 200, extra: Record<string, string> = {}) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
    });
  };

  try {
    // ── Authenticate ──
    const auth = await authenticateApiKey(req, supabase);
    if ('error' in auth) return respond({ error: auth.error }, auth.status);
    const { keyData } = auth;
    const userId = keyData.user_id;

    // ── Rate limit ──
    const rl = await checkRateLimit(supabaseUrl, serviceKey, keyData.id, resource || 'default');
    if (!rl.allowed) {
      return respond(
        { error: 'Rate limit exceeded', resetAt: rl.resetAt },
        429,
        { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': rl.resetAt || '' },
      );
    }

    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Remaining': String(rl.tokensRemaining ?? ''),
      'X-RateLimit-Reset': rl.resetAt || '',
    };

    let body: any = null;
    if (['POST', 'PATCH', 'PUT'].includes(method)) {
      try { body = await req.json(); } catch { return respond({ error: 'Invalid JSON body' }, 400); }
    }

    let result: any;
    let statusCode = 200;

    // ── LEADS ──
    if (resource === 'leads') {
      if (action === 'bulk' && method === 'POST') {
        // Bulk import
        if (!body?.leads || !Array.isArray(body.leads)) return respond({ error: 'leads array is required' }, 400);
        if (body.leads.length > MAX_BULK) return respond({ error: `Maximum ${MAX_BULK} leads per request` }, 400);

        const imported: any[] = [];
        const failed: any[] = [];
        for (let i = 0; i < body.leads.length; i++) {
          const v = validateLead(body.leads[i]);
          if (v.error) { failed.push({ index: i, error: v.error }); continue; }
          const { data, error } = await supabase.from('leads').insert({ ...v.data, user_id: userId }).select().single();
          if (error) { failed.push({ index: i, error: error.message }); } else { imported.push(data); }
        }
        result = { imported: imported.length, failed: failed.length, leads: imported, errors: failed };
        statusCode = 201;
      } else if (action === 'enrich' && id && method === 'POST') {
        // Trigger enrichment via existing edge function
        const enrichRes = await fetch(`${supabaseUrl}/functions/v1/enrich-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ leadId: id, userId }),
        });
        result = await enrichRes.json();
        statusCode = enrichRes.status;
      } else if (action === 'score' && id && method === 'POST') {
        // Trigger scoring via existing edge function
        const scoreRes = await fetch(`${supabaseUrl}/functions/v1/score-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ leadId: id, userId }),
        });
        result = await scoreRes.json();
        statusCode = scoreRes.status;
      } else if (method === 'GET' && !id) {
        const filters: Record<string, string> = {};
        if (url.searchParams.get('industry')) filters.industry = String(url.searchParams.get('industry')).substring(0, 100);
        if (url.searchParams.get('status')) filters.lead_status = String(url.searchParams.get('status')).substring(0, 50);
        result = await handleList(supabase, 'leads', userId, url.searchParams, filters);
      } else if (method === 'GET' && id) {
        result = await handleGet(supabase, 'leads', userId, id);
      } else if (method === 'POST' && !id) {
        const v = validateLead(body);
        if (v.error) return respond({ error: v.error }, 400);
        result = await handleCreate(supabase, 'leads', userId, v.data);
        statusCode = 201;
      } else if (method === 'PATCH' && id) {
        const v = validateLead({ ...body, contact_name: body.contact_name || 'placeholder', company_name: body.company_name || 'placeholder' });
        const updates = { ...v.data };
        if (!body.contact_name) delete updates.contact_name;
        if (!body.company_name) delete updates.company_name;
        result = await handleUpdate(supabase, 'leads', userId, id, updates);
      } else if (method === 'DELETE' && id) {
        result = await handleDelete(supabase, 'leads', userId, id);
      } else {
        return respond({ error: 'Method not allowed' }, 405);
      }
    }

    // ── DEALS ──
    else if (resource === 'deals') {
      if (method === 'GET' && !id) {
        const filters: Record<string, string> = {};
        if (url.searchParams.get('stage')) filters.stage = String(url.searchParams.get('stage')).substring(0, 50);
        result = await handleList(supabase, 'deals', userId, url.searchParams, filters);
      } else if (method === 'GET' && id) {
        result = await handleGet(supabase, 'deals', userId, id);
      } else if (method === 'POST') {
        const v = validateDeal(body);
        if (v.error) return respond({ error: v.error }, 400);
        result = await handleCreate(supabase, 'deals', userId, v.data);
        statusCode = 201;
      } else if (method === 'PATCH' && id) {
        const v = validateDeal({ ...body, title: body.title || 'placeholder', company_name: body.company_name || 'placeholder' });
        const updates = { ...v.data };
        if (!body.title) delete updates.title;
        if (!body.company_name) delete updates.company_name;
        result = await handleUpdate(supabase, 'deals', userId, id, updates);
      } else if (method === 'DELETE' && id) {
        result = await handleDelete(supabase, 'deals', userId, id);
      } else {
        return respond({ error: 'Method not allowed' }, 405);
      }
    }

    // ── ACTIVITIES ──
    else if (resource === 'activities') {
      if (method === 'GET' && !id) {
        const filters: Record<string, string> = {};
        if (url.searchParams.get('type')) filters.type = String(url.searchParams.get('type')).substring(0, 50);
        result = await handleList(supabase, 'activities', userId, url.searchParams, filters);
      } else if (method === 'GET' && id) {
        result = await handleGet(supabase, 'activities', userId, id);
      } else if (method === 'POST') {
        const v = validateActivity(body);
        if (v.error) return respond({ error: v.error }, 400);
        result = await handleCreate(supabase, 'activities', userId, v.data);
        statusCode = 201;
      } else if (method === 'PATCH' && id) {
        const v = validateActivity({ ...body, subject: body.subject || 'placeholder', type: body.type || 'placeholder' });
        const updates = { ...v.data };
        if (!body.subject) delete updates.subject;
        if (!body.type) delete updates.type;
        result = await handleUpdate(supabase, 'activities', userId, id, updates);
      } else if (method === 'DELETE' && id) {
        result = await handleDelete(supabase, 'activities', userId, id);
      } else {
        return respond({ error: 'Method not allowed' }, 405);
      }
    }

    // ── CONTACTS ──
    else if (resource === 'contacts') {
      if (method === 'GET' && !id) {
        const filters: Record<string, string> = {};
        if (url.searchParams.get('status')) filters.lead_status = String(url.searchParams.get('status')).substring(0, 50);
        result = await handleList(supabase, 'contacts', userId, url.searchParams, filters);
      } else if (method === 'GET' && id) {
        result = await handleGet(supabase, 'contacts', userId, id);
      } else if (method === 'POST') {
        const v = validateContact(body);
        if (v.error) return respond({ error: v.error }, 400);
        result = await handleCreate(supabase, 'contacts', userId, v.data);
        statusCode = 201;
      } else if (method === 'PATCH' && id) {
        result = await handleUpdate(supabase, 'contacts', userId, id, body);
      } else if (method === 'DELETE' && id) {
        result = await handleDelete(supabase, 'contacts', userId, id);
      } else {
        return respond({ error: 'Method not allowed' }, 405);
      }
    }

    // ── WORKFLOWS ──
    else if (resource === 'workflows') {
      if (method === 'GET' && !id) {
        result = await handleList(supabase, 'workflows', userId, url.searchParams);
      } else if (method === 'GET' && id) {
        result = await handleGet(supabase, 'workflows', userId, id);
      } else if (method === 'PATCH' && id) {
        const updates: any = {};
        if (body.active !== undefined) updates.active = Boolean(body.active);
        if (body.name) updates.name = sanitize(body.name, 200);
        result = await handleUpdate(supabase, 'workflows', userId, id, updates);
      } else if (action === 'execute' && id && method === 'POST') {
        const execRes = await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ workflowId: id, testData: body?.data || {} }),
        });
        result = await execRes.json();
        statusCode = execRes.status;
      } else {
        return respond({ error: 'Method not allowed' }, 405);
      }
    }

    // ── EMAIL ──
    else if (resource === 'email') {
      if (action === 'generate' || (!id && method === 'POST')) {
        const genRes = await fetch(`${supabaseUrl}/functions/v1/generate-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ ...body, userId }),
        });
        result = await genRes.json();
        statusCode = genRes.status;
      } else {
        return respond({ error: 'Method not allowed' }, 405);
      }
    }

    // ── Unknown resource ──
    else {
      return respond({
        error: 'Unknown resource',
        available: ['leads', 'deals', 'activities', 'contacts', 'workflows', 'email'],
      }, 404);
    }

    // Handle result errors from helpers
    if (result?.error && result?.status) {
      statusCode = result.status;
    }
    if (result?.status === 201) statusCode = 201;

    const responseTime = Date.now() - startTime;

    // Log usage (fire and forget)
    logUsage(supabase, keyData.id, `/${resource}${id ? '/' + id : ''}${action ? '/' + action : ''}`, method, statusCode, responseTime).catch(() => {});

    return respond(result, statusCode, rateLimitHeaders);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('Error', errorMessage);
    return respond({ error: 'Internal server error' }, 500);
  }
});
