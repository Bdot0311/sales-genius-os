import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CF_API = 'https://api.cloudflare.com/client/v4';

// Allowed record name prefixes — prevents writing arbitrary records.
const ALLOWED_NAMES = new Set(['@', '_dmarc']);

interface RecordInput {
  type: 'TXT';
  name: string;
  content: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Invalid user token');

    const { domain, cfToken, records } = await req.json() as {
      domain: string;
      cfToken: string;
      records: RecordInput[];
    };

    if (!domain || !cfToken || !Array.isArray(records) || records.length === 0) {
      throw new Error('domain, cfToken, and records are required');
    }

    // Validate record names so we can't be used to write arbitrary DNS.
    for (const r of records) {
      if (r.type !== 'TXT') throw new Error('Only TXT records are supported');
      if (!ALLOWED_NAMES.has(r.name)) throw new Error(`Record name "${r.name}" is not permitted`);
    }

    const cfHeaders = {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    };

    // Step 1: find zone ID
    const zonesRes = await fetch(`${CF_API}/zones?name=${encodeURIComponent(domain)}&status=active`, {
      headers: cfHeaders,
    });
    const zonesData = await zonesRes.json();
    if (!zonesData.success) {
      const msg = zonesData.errors?.[0]?.message || 'Cloudflare API error';
      return json({ success: false, error: `Token rejected: ${msg}` });
    }
    if (zonesData.result.length === 0) {
      return json({ success: false, error: `Domain "${domain}" not found in this Cloudflare account. Make sure the token has Zone:DNS:Edit access.` });
    }
    const zoneId: string = zonesData.result[0].id;

    // Step 2: fetch existing TXT records for the zone
    const existingRes = await fetch(`${CF_API}/zones/${zoneId}/dns_records?type=TXT&per_page=100`, {
      headers: cfHeaders,
    });
    const existingData = await existingRes.json();
    const existing: any[] = existingData.result || [];

    // Step 3: create or update each record
    const results: Array<{ name: string; action: string; success: boolean; error?: string }> = [];

    for (const rec of records) {
      const fullName = rec.name === '@' ? domain : `${rec.name}.${domain}`;
      const existing_ = existing.find((r) => r.name === fullName);

      const payload = {
        type: 'TXT',
        name: fullName,
        content: rec.content,
        ttl: 3600,
      };

      if (existing_) {
        // Update
        const r = await fetch(`${CF_API}/zones/${zoneId}/dns_records/${existing_.id}`, {
          method: 'PUT',
          headers: cfHeaders,
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        results.push({ name: rec.name, action: 'updated', success: d.success, error: d.errors?.[0]?.message });
      } else {
        // Create
        const r = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
          method: 'POST',
          headers: cfHeaders,
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        results.push({ name: rec.name, action: 'created', success: d.success, error: d.errors?.[0]?.message });
      }
    }

    const allOk = results.every((r) => r.success);
    return json({ success: allOk, results });
  } catch (err) {
    console.error('apply-cloudflare-dns error:', err);
    const msg = err instanceof Error ? err.message : 'Operation failed';
    return json({ success: false, error: msg }, msg.includes('Invalid user token') ? 401 : 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
