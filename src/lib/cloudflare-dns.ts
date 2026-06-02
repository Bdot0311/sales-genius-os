import { supabase } from "@/integrations/supabase/client";

export interface CfRecord {
  type: 'TXT';
  name: '@' | '_dmarc';
  content: string;
}

export interface CfApplyResult {
  success: boolean;
  results?: Array<{ name: string; action: string; success: boolean; error?: string }>;
  error?: string;
}

export async function applyCloudflareRecords(
  domain: string,
  cfToken: string,
  records: CfRecord[]
): Promise<CfApplyResult> {
  const { data, error } = await supabase.functions.invoke('apply-cloudflare-dns', {
    body: { domain, cfToken, records },
  });
  if (error) return { success: false, error: error.message };
  return data as CfApplyResult;
}
