import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ExternalLeadFilters {
  job_title?: string;
  industry?: string;
  company_size?: string;
  include_unknown_size?: boolean;
  country?: string;
  limit?: number;
}

export interface LeadScores {
  icp_score: number;
  intent_score: number;
  enrichment_score: number;
  overall_score: number;
}

export interface ExternalLead {
  job_title: string;
  company_name: string;
  company_domain: string;
  business_email: string;
  contact_name: string;
  industry?: string;
  company_size?: string;
  country?: string;
  linkedin_url?: string;
  scores: LeadScores;
  score_explanation: string;
  buying_signals: string[];
}

export function useExternalLeads() {
  const [leads, setLeads] = useState<ExternalLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [activatingLead, setActivatingLead] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchLeads = async (filters: ExternalLeadFilters) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-external-leads', {
        body: filters,
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setLeads(data.leads || []);
      
      if (data.credits_used) {
        console.log(`PDL credits used: ${data.credits_used}`);
      }
      
      return data.leads || [];
    } catch (error: any) {
      toast({
        title: 'Error fetching leads',
        description: error.message,
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const activateLead = async (lead: ExternalLead) => {
    const leadKey = `${lead.company_domain}-${lead.contact_name}`;
    setActivatingLead(leadKey);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const userId = session.user.id;

      // Step 1: Check if company exists, if not create it
      let companyId: string | null = null;
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', userId)
        .eq('domain', lead.company_domain)
        .maybeSingle();

      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const { data: newCompany, error: companyError } = await supabase
          .from('companies')
          .insert({
            user_id: userId,
            name: lead.company_name,
            domain: lead.company_domain,
            industry: lead.industry,
            country: lead.country,
          })
          .select('id')
          .single();

        if (companyError) throw companyError;
        companyId = newCompany.id;
      }

      // Step 2: Check if contact exists, if not create it
      let contactId: string | null = null;
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', userId)
        .eq('email', lead.business_email)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
        // Update contact to active status
        await supabase
          .from('contacts')
          .update({ lead_status: 'active' })
          .eq('id', contactId);
      } else {
        const nameParts = lead.contact_name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            user_id: userId,
            company_id: companyId,
            first_name: firstName,
            last_name: lastName,
            email: lead.business_email,
            job_title: lead.job_title,
            linkedin_url: lead.linkedin_url,
            country: lead.country,
            lead_status: 'active',
            source: 'People Data Labs',
          })
          .select('id')
          .single();

        if (contactError) throw contactError;
        contactId = newContact.id;
      }

      // Step 3: Save lead score
      const { error: scoreError } = await supabase
        .from('lead_scores')
        .upsert({
          user_id: userId,
          contact_id: contactId,
          icp_score: lead.scores.icp_score,
          intent_score: lead.scores.intent_score,
          enrichment_score: lead.scores.enrichment_score,
          overall_score: lead.scores.overall_score,
          explanation: lead.score_explanation,
        }, {
          onConflict: 'contact_id',
        });

      if (scoreError) throw scoreError;

      // Step 4: Also save to leads table for backward compatibility
      const { error: leadError } = await supabase
        .from('leads')
        .insert({
          user_id: userId,
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          contact_email: lead.business_email,
          industry: lead.industry,
          company_size: lead.company_size,
          job_title: lead.job_title,
          linkedin_url: lead.linkedin_url,
          company_website: lead.company_domain ? `https://${lead.company_domain}` : undefined,
          source: 'People Data Labs',
          lead_status: 'active',
          icp_score: lead.scores.overall_score,
        });

      if (leadError) throw leadError;

      toast({
        title: 'Lead activated',
        description: `${lead.contact_name} from ${lead.company_name} is now ready for outreach!`,
      });

      // Remove from external leads list
      setLeads(prev => prev.filter(l => 
        `${l.company_domain}-${l.contact_name}` !== leadKey
      ));

      return true;
    } catch (error: any) {
      toast({
        title: 'Error activating lead',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setActivatingLead(null);
    }
  };

  const clearLeads = () => setLeads([]);

  return {
    leads,
    loading,
    activatingLead,
    fetchLeads,
    activateLead,
    clearLeads,
  };
}
