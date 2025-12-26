import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DnsRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface CloudflareDnsResponse {
  Status: number;
  Answer?: DnsRecord[];
}

// Domain validation to prevent SSRF attacks
function validateDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;
  if (domain.length > 253) return false;
  
  // Strict domain pattern - only allows valid domain characters
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!domainPattern.test(domain)) return false;
  
  // Block reserved TLDs and internal domains
  const blockedTlds = ['.local', '.internal', '.test', '.localhost', '.lan', '.localdomain', '.home', '.corp', '.private'];
  const lowerDomain = domain.toLowerCase();
  if (blockedTlds.some(tld => lowerDomain.endsWith(tld))) return false;
  
  // Block IP addresses
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipPattern.test(domain)) return false;
  
  // Block localhost variations
  if (lowerDomain.includes('localhost') || lowerDomain.includes('127.0.0.1') || lowerDomain.includes('0.0.0.0')) return false;
  
  return true;
}

async function checkDnsRecord(domain: string, recordType: string): Promise<string[]> {
  try {
    // Encode domain to prevent URL injection
    const encodedDomain = encodeURIComponent(domain);
    const url = `https://cloudflare-dns.com/dns-query?name=${encodedDomain}&type=${recordType}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/dns-json',
      },
    });

    if (!response.ok) {
      console.error(`DNS lookup failed for ${domain} (${recordType}):`, response.status);
      return [];
    }

    const data: CloudflareDnsResponse = await response.json();
    
    if (!data.Answer || data.Answer.length === 0) {
      return [];
    }

    return data.Answer.map(record => record.data);
  } catch (error) {
    console.error(`Error checking DNS for ${domain} (${recordType}):`, error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { domain, verificationToken } = await req.json();

    if (!domain || !verificationToken) {
      return new Response(
        JSON.stringify({ error: 'Domain and verification token are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate domain to prevent SSRF attacks
    if (!validateDomain(domain)) {
      console.warn(`[VERIFY-DOMAIN] Invalid domain rejected: ${domain}`);
      return new Response(
        JSON.stringify({ error: 'Invalid domain format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[VERIFY-DOMAIN] Checking DNS for domain: ${domain}`);

    // Check A record for root domain (@)
    const rootARecords = await checkDnsRecord(domain, 'A');
    const hasRootA = rootARecords.includes('185.158.133.1');
    console.log(`[VERIFY-DOMAIN] Root A record check: ${hasRootA}`, rootARecords);

    // Check A record for www subdomain
    const wwwARecords = await checkDnsRecord(`www.${domain}`, 'A');
    const hasWwwA = wwwARecords.includes('185.158.133.1');
    console.log(`[VERIFY-DOMAIN] WWW A record check: ${hasWwwA}`, wwwARecords);

    // Check TXT record for verification
    const txtRecords = await checkDnsRecord(`_verify.${domain}`, 'TXT');
    const expectedTxt = `${domain}_verify=${verificationToken}`;
    const hasTxt = txtRecords.some(record => 
      record.replace(/"/g, '').trim() === expectedTxt
    );
    console.log(`[VERIFY-DOMAIN] TXT record check: ${hasTxt}`, txtRecords);
    console.log(`[VERIFY-DOMAIN] Expected TXT: ${expectedTxt}`);

    // Validation results
    const validationResults = {
      rootARecord: hasRootA,
      wwwARecord: hasWwwA,
      txtRecord: hasTxt,
      isFullyVerified: hasRootA && hasWwwA && hasTxt,
    };

    console.log(`[VERIFY-DOMAIN] Validation results:`, validationResults);

    // If all checks pass, update the domain as verified
    if (validationResults.isFullyVerified) {
      const { error: updateError } = await supabaseClient
        .from('white_label_settings')
        .update({ domain_verified: true })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('[VERIFY-DOMAIN] Error updating domain status:', updateError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to update domain verification status',
            validationResults 
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Domain verified successfully!',
          validationResults 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Return validation results with details about what's missing
      const missingRecords = [];
      if (!hasRootA) missingRecords.push('Root domain A record pointing to 185.158.133.1');
      if (!hasWwwA) missingRecords.push('WWW subdomain A record pointing to 185.158.133.1');
      if (!hasTxt) missingRecords.push(`TXT record at _verify.${domain} with value: ${expectedTxt}`);

      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'DNS records not fully configured',
          validationResults,
          missingRecords
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('[VERIFY-DOMAIN] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Domain verification failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
