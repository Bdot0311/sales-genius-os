import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { posthog } from '@/lib/posthog';
import { classifySearchError } from '@/lib/search-error';
import {
  cursorForPage,
  hasNextPage as computeHasNextPage,
  recordCursor,
  resetTrail,
} from '@/lib/cursor-trail';

export interface ExternalLeadFilters {
  /** Original natural-language request for the provider's semantic parser. */
  query?: string;
  job_title?: string;
  industry?: string;
  company_size?: string;
  include_unknown_size?: boolean;
  country?: string;
  company?: string;
  company_domain?: string;
  companies?: Array<{ name?: string; domain?: string }>;
  seniority?: string;
  seniority_levels?: string[];
  job_titles?: string[];
  industries?: string[];
  countries?: string[];
  exclude_titles?: string[];
  exclude_industries?: string[];
  exclude_keywords?: string[];
  keywords?: string[];
  limit?: number;
  page?: number;
  /** Opt in to retrying without industry/keywords when nothing matches. */
  relax?: boolean;
  /** Opaque provider cursor, echoed from a previous response's next_cursor. */
  cursor?: string;
}

/** What the search actually ran with, as reported by the edge function. */
export interface SearchDisclosure {
  /** The filters sent upstream, after normalisation. */
  applied: Record<string, unknown> | null;
  /** Filters dropped by an opt-in broadening retry — empty when none were. */
  relaxed: string[];
}

export interface LeadScores {
  /** Null when the user has stated no ICP — nothing to measure fit against. */
  icp_score: number | null;
  /** Null in search: intent needs fired signals, which need enrichment. */
  intent_score: number | null;
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
  /**
   * Whether another page can actually be fetched.
   *
   * Derived from the provider's cursor when there is one, because a cursor is
   * the provider saying "there is more" — the row total is an estimate and
   * cannot be trusted to decide when to stop.
   */
  hasNextPage: boolean;
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
    hasNextPage: false,
  });
  // A cursor only ever points forward, so the trail remembers the one that
  // fetched each page — see lib/cursor-trail.
  const [cursors, setCursors] = useState<(string | null)[]>(resetTrail);
  const [lastFilters, setLastFilters] = useState<ExternalLeadFilters | null>(null);
  // Surfacing what the search actually ran with is the difference between
  // "these leads look random" and "industry was dropped, here is why".
  const [disclosure, setDisclosure] = useState<SearchDisclosure>({ applied: null, relaxed: [] });
  const { toast } = useToast();

  const fetchLeads = async (filters: ExternalLeadFilters, isPageChange = false) => {
    // Clear previous results immediately when starting a new search (not page change)
    if (!isPageChange) {
      setLeads([]);
      setDisclosure({ applied: null, relaxed: [] });
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalResults: 0,
        pageSize: filters.limit || 10,
        hasNextPage: false,
      });
      setCursors(resetTrail());
    }
    setLoading(true);
    setLastFilters(filters);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-external-leads', {
        body: filters,
      });

      if (error) throw error;

      if (data.error) {
        // Carry the edge function's classification through the throw — without
        // it the catch below can only guess at the message text.
        throw Object.assign(new Error(data.error), {
          errorCode: data.error_code,
          remainingCredits: data.remaining_credits,
          upgradeRequired: data.upgrade_required,
        });
      }

      // Only set leads that were returned for this specific search
      const newLeads = data.leads || [];
      setLeads(newLeads);
      posthog.capture('scan_run');
      setDisclosure({
        applied: data.applied_filters ?? null,
        relaxed: Array.isArray(data.relaxed_filters) ? data.relaxed_filters : [],
      });
      
      // Update pagination info
      const pageSize = filters.limit || 10;
      const total = data.total || newLeads.length;
      const currentPage = filters.page || 1;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      
      const nextCursor: string | null = data.next_cursor ?? null;
      setCursors((prev) => recordCursor(prev, currentPage, nextCursor));

      setPagination({
        currentPage,
        totalPages,
        totalResults: total,
        pageSize,
        hasNextPage: computeHasNextPage(nextCursor, currentPage, totalPages),
      });
      
      posthog.capture('lead_search_completed', {
        result_count: newLeads.length,
        total_results: total,
        page: currentPage,
        page_size: pageSize,
        credits_used: Boolean(data.credits_used),
      });
      
      return newLeads;
    } catch (error: any) {
      let errorMessage = error.message || 'Failed to fetch leads';
      let errorCode: string | undefined = error.errorCode;
      let remainingCredits: number | undefined = error.remainingCredits;
      let upgradeRequired: boolean | undefined = error.upgradeRequired;

      // Supabase FunctionsHttpError — try to extract the actual body from the edge function
      if (error.context) {
        try {
          const body = await error.context.json?.();
          if (body?.error) errorMessage = body.error;
          else if (body?.message) errorMessage = body.message;
          if (body?.error_code) errorCode = body.error_code;
          if (body?.remaining_credits !== undefined) remainingCredits = body.remaining_credits;
          if (body?.upgrade_required !== undefined) upgradeRequired = body.upgrade_required;
        } catch {}
      }

      const { title, description, durationMs } = classifySearchError({
        message: errorMessage,
        code: errorCode,
        remainingCredits,
        upgradeRequired,
      });

      toast({
        title,
        description,
        variant: 'destructive',
        ...(durationMs ? { duration: durationMs } : {}),
      });

      posthog.capture('lead_search_failed', {
        error_code: errorCode || 'unknown',
        page: filters.page || 1,
      });

      return [];
    } finally {
      setLoading(false);
    }
  };

  const goToPage = async (page: number) => {
    if (!lastFilters || page < 1) return;
    // A cursor can reach past the row ceiling that bounds offset paging, so the
    // totalPages estimate must not veto a page the provider is offering.
    const cursor = cursorForPage(cursors, page);
    if (page > pagination.totalPages && !cursor) return;

    await fetchLeads({ ...lastFilters, page, cursor }, true);
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
            source: 'OutReign',
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
          // The account row was just resolved or created above. Linking here is
          // what lets per-account features find this lead without matching on a
          // name string that different flows spell differently.
          company_id: companyId,
          contact_name: lead.contact_name,
          contact_email: lead.business_email,
          industry: lead.industry,
          company_size: lead.company_size,
          job_title: lead.job_title,
          linkedin_url: lead.linkedin_url,
          company_website: lead.company_domain ? `https://${lead.company_domain}` : undefined,
          source: 'OutReign',
          lead_status: 'active',
          // The fit score, not the overall blend. overall_score mixes fit with
          // data completeness, so saving it here put a third different number
          // in the column the ICP badge reads. Null when no ICP is set; the
          // scorer overwrites this on enrichment either way.
          icp_score: lead.scores.icp_score,
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
        source: 'Lusha',
        status: 'success',
      });

      toast({
        title: 'Lead enriched & saved',
        description: `${lead.contact_name} from ${lead.company_name} is now in your saved leads!`,
      });

      posthog.capture('lead_enriched', {
        overall_score: lead.scores.overall_score,
        has_linkedin_profile: Boolean(lead.linkedin_url),
        source: 'lead_intelligence',
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
    setCursors(resetTrail());
    setDisclosure({ applied: null, relaxed: [] });
    setPagination({
      currentPage: 1,
      totalPages: 1,
      totalResults: 0,
      pageSize: 10,
      hasNextPage: false,
    });
    setLastFilters(null);
  };

  return {
    leads,
    loading,
    activatingLead,
    pagination,
    disclosure,
    fetchLeads,
    activateLead,
    clearLeads,
    goToPage,
  };
}
