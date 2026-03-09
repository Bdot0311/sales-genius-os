import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CachedContact {
  email?: string;
  phone?: string;
  company_name?: string;
  job_title?: string;
  linkedin_url?: string;
}

/**
 * Hook for checking if contact data already exists in the database
 * to prevent duplicate API calls and credit consumption
 */
export const useContactCache = () => {
  /**
   * Check if a contact with the given email already exists in the database
   */
  const checkEmailExists = useCallback(async (email: string): Promise<CachedContact | null> => {
    if (!email) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Check leads table
      const { data: leadData } = await supabase
        .from('leads')
        .select('contact_email, contact_phone, company_name, job_title, linkedin_url')
        .eq('user_id', user.id)
        .eq('contact_email', email.toLowerCase())
        .limit(1)
        .single();

      if (leadData) {
        return {
          email: leadData.contact_email || undefined,
          phone: leadData.contact_phone || undefined,
          company_name: leadData.company_name || undefined,
          job_title: leadData.job_title || undefined,
          linkedin_url: leadData.linkedin_url || undefined,
        };
      }

      // Check contacts table
      const { data: contactData } = await supabase
        .from('contacts')
        .select('email, first_name, last_name, job_title, linkedin_url')
        .eq('user_id', user.id)
        .eq('email', email.toLowerCase())
        .limit(1)
        .single();

      if (contactData) {
        return {
          email: contactData.email || undefined,
          job_title: contactData.job_title || undefined,
          linkedin_url: contactData.linkedin_url || undefined,
        };
      }

      return null;
    } catch (error) {
      // No cached data found
      return null;
    }
  }, []);

  /**
   * Check if a contact with the given LinkedIn URL already exists
   */
  const checkLinkedInExists = useCallback(async (linkedinUrl: string): Promise<CachedContact | null> => {
    if (!linkedinUrl) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Normalize LinkedIn URL
      const normalizedUrl = linkedinUrl.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');

      // Check leads table
      const { data: leadData } = await supabase
        .from('leads')
        .select('contact_email, contact_phone, company_name, job_title, linkedin_url')
        .eq('user_id', user.id)
        .ilike('linkedin_url', `%${normalizedUrl}%`)
        .limit(1)
        .single();

      if (leadData) {
        return {
          email: leadData.contact_email || undefined,
          phone: leadData.contact_phone || undefined,
          company_name: leadData.company_name || undefined,
          job_title: leadData.job_title || undefined,
          linkedin_url: leadData.linkedin_url || undefined,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }, []);

  /**
   * Check if company data already exists in the database
   */
  const checkCompanyExists = useCallback(async (domain: string): Promise<{ exists: boolean; data?: any }> => {
    if (!domain) return { exists: false };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { exists: false };

      // Normalize domain
      const normalizedDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').split('/')[0];

      // Check companies table
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .eq('domain', normalizedDomain)
        .limit(1)
        .single();

      if (companyData) {
        return { exists: true, data: companyData };
      }

      return { exists: false };
    } catch (error) {
      return { exists: false };
    }
  }, []);

  /**
   * Check multiple emails at once for batch operations
   */
  const checkBatchEmails = useCallback(async (emails: string[]): Promise<Map<string, CachedContact>> => {
    const cached = new Map<string, CachedContact>();
    if (!emails.length) return cached;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return cached;

      const normalizedEmails = emails.map(e => e.toLowerCase());

      const { data: leads } = await supabase
        .from('leads')
        .select('contact_email, contact_phone, company_name, job_title, linkedin_url')
        .eq('user_id', user.id)
        .in('contact_email', normalizedEmails);

      if (leads) {
        for (const lead of leads) {
          if (lead.contact_email) {
            cached.set(lead.contact_email.toLowerCase(), {
              email: lead.contact_email || undefined,
              phone: lead.contact_phone || undefined,
              company_name: lead.company_name || undefined,
              job_title: lead.job_title || undefined,
              linkedin_url: lead.linkedin_url || undefined,
            });
          }
        }
      }

      return cached;
    } catch (error) {
      console.error('Error checking batch emails:', error);
      return cached;
    }
  }, []);

  return {
    checkEmailExists,
    checkLinkedInExists,
    checkCompanyExists,
    checkBatchEmails,
  };
};
