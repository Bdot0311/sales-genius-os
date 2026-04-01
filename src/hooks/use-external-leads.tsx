import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ExternalLeadFilters {
  job_title?: string;
  industry?: string;
  company_size?: string;
  include_unknown_size?: boolean;
  country?: string;
  company?: string;
  seniority?: string;
  keywords?: string[];
  limit?: number;
  page?: number;
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

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  pageSize: number;
}

export function useExternalLeads() {
  const [leads, setLeads] = useState<ExternalLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [activatingLead, setActivatingLead] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalResults: 0,
    pageSize: 10,
  });
  const [lastFilters, setLastFilters] = useState<ExternalLeadFilters | null>(null);
  const { toast } = useToast();

  const fetchLeads = async (filters: ExternalLeadFilters, isPageChange = false) => {
    // Clear previous results immediately when starting a new search (not page change)
    if (!isPageChange) {
      setLeads([]);
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalResults: 0,
        pageSize: filters.limit || 10,
      });
    }
    setLoading(true);
    setLastFilters(filters);
    
    try {
      console.log('Fetching leads with filters:', filters);
      const { data, error } = await supabase.functions.invoke('fetch-external-leads', {
        body: filters,
      });

      if (error) throw error;
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Only set leads that were returned for this specific search
      const newLeads = data.leads || [];
      console.log(`Received ${newLeads.length} leads matching search criteria`);
      setLeads(newLeads);
      
      // Update pagination info
      const pageSize = filters.limit || 10;
      const total = data.total || newLeads.length;
      const currentPage = filters.page || 1;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      
      setPagination({
        currentPage,
        totalPages,
        totalResults: total,
        pageSize,
      });
      
      if (data.credits_used) {
        console.log(`PDL credits used: ${data.credits_used}`);
      }
      
      return newLeads;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to fetch leads';
      
      // Check for credit-related errors
      if (errorMessage.includes('credits') || errorMessage.includes('402') || errorMessage.includes('Payment') || errorMessage.includes('exhausted')) {
        toast({
          title: 'Data Provider Credits Exhausted',
          description: 'Your external data provider credits have been used up. Contact support or add more credits to continue searching.',
          variant: 'destructive',
          duration: 10000,
        });
      } else if (errorMessage.includes('search parameter') || errorMessage.includes('filter')) {
        toast({
          title: 'Search Filter Required',
          description: 'Please provide at least one search filter like job title, industry, or location.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error fetching leads',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      return [];
    } finally {
      setLoading(false);
    }
  };

  const goToPage = async (page: number) => {
    if (!lastFilters || page < 1 || page > pagination.totalPages) return;
    
    const filtersWithPage = { ...lastFilters, page };
    await fetchLeads(filtersWithPage, true);
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

      // Step 4: Save to leads table with enriched status
      const { data: savedLead, error: leadError } = await supabase
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
          enrichment_status: 'enriched',
          enriched_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (leadError) throw leadError;

      // Step 5: Record enrichment history
      await supabase.from('enrichment_history').insert({
        user_id: userId,
        lead_id: savedLead.id,
        fields_enriched: ['company_name', 'contact_name', 'contact_email', 'industry', 'company_size', 'job_title', 'linkedin_url', 'icp_score'],
        source: 'People Data Labs',
        status: 'success',
      });

      toast({
        title: 'Lead enriched & saved',
        description: `${lead.contact_name} from ${lead.company_name} is now in your saved leads!`,
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

  const clearLeads = () => {
    setLeads([]);
    setPagination({
      currentPage: 1,
      totalPages: 1,
      totalResults: 0,
      pageSize: 10,
    });
    setLastFilters(null);
  };

  return {
    leads,
    loading,
    activatingLead,
    pagination,
    fetchLeads,
    activateLead,
    clearLeads,
    goToPage,
  };
}
