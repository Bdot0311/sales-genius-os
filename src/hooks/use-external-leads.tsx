import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { posthog } from '@/lib/posthog';
import { classifySearchError } from '@/lib/search-error';
import {
  enrichedFieldsPresent,
  isDuplicateKeyError,
  normalizeCompanyDomain,
  normalizeLeadEmail,
  saveToast,
  splitContactName,
} from '@/lib/lead-activation';
import {
  cursorForPage,
  hasNextPage as computeHasNextPage,
  recordCursor,
  resetTrail,
} from '@/lib/cursor-trail';
import { coalesce, requestKey } from '@/lib/in-flight';

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
  /** Skip leads the user has already been shown. */
  exclude_seen?: boolean;
}

/** What the search actually ran with, as reported by the edge function. */
export interface SearchDisclosure {
  /** The filters sent upstream, after normalisation. */
  applied: Record<string, unknown> | null;
  /** Filters dropped by an opt-in broadening retry — empty when none were. */
  relaxed: string[];
  /**
   * The edge function's own explanation of an empty result. An outage and a
   * genuinely empty match set are different problems, and only the backend
   * knows which one happened.
   */
  message: string | null;
  /** True when the data provider could not answer at all. */
  providerUnavailable: boolean;
  /**
   * Whether re-running wider could possibly help. False during an outage —
   * loosening filters that were never the problem just wastes the user's time.
   */
  canBroaden: boolean;
}

const EMPTY_DISCLOSURE: SearchDisclosure = {
  applied: null,
  relaxed: [],
  message: null,
  providerUnavailable: false,
  canBroaden: true,
};

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
  /**
   * Deliverability, decided server-side before the lead was returned.
   *
   * Addresses proven undeliverable are dropped by the edge function and never
   * arrive here, so these values describe degrees of confidence in what did:
   * `valid` is a confirmed mailbox, `catch_all` and `role` and `unknown` are
   * send-at-your-own-risk, and `null` means the lead came with no email.
   */
  email_verification_status?: 'valid' | 'catch_all' | 'unknown' | 'invalid' | 'role' | null;
  email_verified?: boolean | null;
  email_verification_reason?: string | null;
  /** The organisation's LinkedIn, kept separate from the contact's profile. */
  company_linkedin?: string | null;
  /** Email and company website are on different domains — see the mapper. */
  email_domain_mismatch?: boolean;
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
  const [disclosure, setDisclosure] = useState<SearchDisclosure>(EMPTY_DISCLOSURE);
  // How many results the last search dropped as confirmed-undeliverable. A page
  // that comes back short is otherwise indistinguishable from a weak search.
  const [removedUndeliverable, setRemovedUndeliverable] = useState(0);
  const { toast } = useToast();
  // Searches and reveals in flight, so the same one asked twice at once is
  // asked once. Both are billed per call and both have flows where the button
  // is still live when the second click lands — see lib/in-flight.
  const searchesInFlight = useRef(new Map<string, Promise<ExternalLead[]>>());
  const revealsInFlight = useRef(new Map<string, Promise<boolean>>());

  /**
   * Run a search, joining one already running for the same filters.
   *
   * The describe tab parses the query with an LLM before it gets here, and
   * `loading` only goes true once it does — so for the length of that parse the
   * input and the send button are enabled and a second Enter starts a second
   * paid search. Rather than teach every caller to hold its own flag, the guard
   * sits on the request itself and covers all of them.
   */
  const fetchLeads = (filters: ExternalLeadFilters, isPageChange = false) =>
    // isPageChange is part of the key because it decides whether the current
    // results are cleared first. Two calls that differ only in that are not the
    // same call, and joining them would let a page change wipe the table.
    coalesce(searchesInFlight.current, requestKey({ filters, isPageChange }), () =>
      runSearch(filters, isPageChange),
    );

  const runSearch = async (filters: ExternalLeadFilters, isPageChange = false) => {
    // Clear previous results immediately when starting a new search (not page change)
    if (!isPageChange) {
      setLeads([]);
      setDisclosure(EMPTY_DISCLOSURE);
      setRemovedUndeliverable(0);
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
        // An empty page is either "nobody matched" or "the network was down".
        // The backend says which; the UI must not invent the friendlier one.
        message: typeof data.message === 'string' ? data.message : null,
        providerUnavailable: data.provider_unavailable === true,
        canBroaden: data.can_broaden !== false,
      });
      setRemovedUndeliverable(Number(data.removed_undeliverable) || 0);
      
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

  /**
   * Save and enrich a lead, joining one already running for the same person.
   *
   * `activatingLead` disables the button, but that only takes effect on the
   * next render — a double click lands before it, and every activation spends a
   * reveal credit at the provider.
   */
  const activateLead = (lead: ExternalLead) => {
    const leadKey = `${lead.company_domain}-${lead.contact_name}`;
    return coalesce(revealsInFlight.current, leadKey, () => saveAndReveal(lead, leadKey));
  };

  const saveAndReveal = async (lead: ExternalLead, leadKey: string) => {
    setActivatingLead(leadKey);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const userId = session.user.id;
      // A blank domain has to reach the database as NULL. companies.domain is
      // uniquely indexed, and "" is not exempt from that index the way NULL is,
      // so the second website-less company a user saved failed with a duplicate
      // key error naming a row they were never shown.
      const domain = normalizeCompanyDomain(lead.company_domain);
      const email = normalizeLeadEmail(lead.business_email);

      // Step 1: Resolve the account, by domain when there is one and by name
      // when there isn't.
      const findCompany = async (): Promise<string | null> => {
        const base = supabase.from('companies').select('id').eq('user_id', userId);
        const query = domain
          ? base.eq('domain', domain)
          : base.is('domain', null).eq('name', lead.company_name);
        const { data } = await query.limit(1).maybeSingle();
        return data?.id ?? null;
      };

      let companyId: string | null = await findCompany();

      if (!companyId) {
        const { data: newCompany, error: companyError } = await supabase
          .from('companies')
          .insert({
            user_id: userId,
            name: lead.company_name,
            domain,
            industry: lead.industry,
            country: lead.country,
          })
          .select('id')
          .single();

        if (companyError) {
          if (!isDuplicateKeyError(companyError)) throw companyError;
          // The domain is spoken for by a row this workspace may not be able to
          // read. Link to it if we can see it; otherwise save the lead without
          // an account link rather than losing the lead over it.
          companyId = await findCompany();
        } else {
          companyId = newCompany.id;
        }
      }

      // Step 2: Check if contact exists, if not create it
      const { firstName, lastName } = splitContactName(lead.contact_name);

      const findContact = async (): Promise<string | null> => {
        const base = supabase.from('contacts').select('id').eq('user_id', userId);
        // Without an address there is nothing unique to match on but the person
        // and the account, and with no account there is nothing safe at all.
        if (!email && !companyId) return null;
        const query = email
          ? base.eq('email', email)
          : base.eq('company_id', companyId!).eq('first_name', firstName).eq('last_name', lastName);
        const { data } = await query.limit(1).maybeSingle();
        return data?.id ?? null;
      };

      let contactId = await findContact();

      if (contactId) {
        // Update contact to active status
        await supabase
          .from('contacts')
          .update({ lead_status: 'active' })
          .eq('id', contactId);
      } else {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            user_id: userId,
            company_id: companyId,
            first_name: firstName,
            last_name: lastName,
            email,
            job_title: lead.job_title,
            linkedin_url: lead.linkedin_url,
            country: lead.country,
            lead_status: 'active',
            source: 'OutReign',
          })
          .select('id')
          .single();

        if (contactError) {
          if (!isDuplicateKeyError(contactError)) throw contactError;
          contactId = await findContact();
        } else {
          contactId = newContact.id;
        }
      }

      // Step 3: Save lead score
      if (contactId) {
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
      }

      // Step 4: Save to leads table
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
          contact_email: email,
          industry: lead.industry,
          company_size: lead.company_size,
          job_title: lead.job_title,
          linkedin_url: lead.linkedin_url,
          company_website: domain ? `https://${domain}` : undefined,
          source: 'OutReign',
          lead_status: 'active',
          // The fit score, not the overall blend. overall_score mixes fit with
          // data completeness, so saving it here put a third different number
          // in the column the ICP badge reads. Null when no ICP is set; the
          // scorer overwrites this on enrichment either way.
          icp_score: lead.scores.icp_score,
          // Carried over from search so the send-time filters have something to
          // gate on. Re-verifying here would bill a second time for an answer
          // the search already paid for and cached.
          email_verification_status: lead.email_verification_status ?? null,
          email_verified: lead.email_verified ?? null,
          email_verified_at: lead.email_verification_status ? new Date().toISOString() : null,
          // Only claim the lead is enriched when it carries the one field the
          // product exists to use. A lead with no address is still pending.
          // Enrichment runs immediately below and writes the final status
          // either way; this is just the value the row starts life with.
          enrichment_status: email ? 'enriched' : 'pending',
          enriched_at: email ? new Date().toISOString() : null,
        })
        .select('id')
        .single();

      if (leadError) throw leadError;

      // Step 5: The button says "Enrich & Save". Without this it only saved —
      // a lead the search returned with no address stayed with no address, and
      // nothing told the user that had happened.
      //
      // This runs even when the lead already has an email, which gating on
      // `!email` skipped. Search returns no phone number for any provider, by
      // design — phones cost money and are revealed on demand — so a lead that
      // arrived with an address was the one case guaranteed never to get a
      // number. That was the other half of "no email and no number".
      let foundEmail: string | null = null;
      let foundPhone: string | null = null;
      let foundPhoneType: string | null = null;
      let enrichmentFailed = false;

      const { data: enriched, error: enrichError } = await supabase.functions.invoke('enrich-lead', {
        body: { leadId: savedLead.id },
      });
      if (enrichError || enriched?.error) {
        enrichmentFailed = true;
        console.error('Enrichment after save failed:', enrichError?.message ?? enriched?.error);
      } else {
        // select('*') rather than naming the columns: a named column the
        // database does not have yet fails the whole request, and a deployment
        // running ahead of its migrations should lose the phone type, not the
        // email with it.
        const { data: refreshedRow } = await supabase
          .from('leads')
          .select('*')
          .eq('id', savedLead.id)
          .maybeSingle();
        const refreshed = (refreshedRow ?? {}) as Record<string, any>;
        foundEmail = normalizeLeadEmail(refreshed.contact_email);
        foundPhone = refreshed.contact_phone ?? null;
        foundPhoneType = refreshed.contact_phone_type ?? null;

        // Backfill the CRM contact. It was created from the search result a
        // moment ago, so anything enrichment turned up is missing from it.
        if (contactId) {
          const contactPatch: Record<string, any> = {};
          if (foundEmail && !email) contactPatch.email = foundEmail;
          if (foundPhone) {
            contactPatch.phone = foundPhone;
            contactPatch.phone_type = foundPhoneType;
          }
          if (Object.keys(contactPatch).length > 0) {
            const { error: patchError } = await supabase
              .from('contacts')
              .update(contactPatch as never)
              .eq('id', contactId);
            // Not fatal: the lead row is the one the product reads from.
            if (patchError) console.warn('contact backfill skipped:', patchError.message);
          }
        }
      }

      // Step 6: Enrichment history.
      //
      // enrich-lead writes its own row for every run, so writing one here too
      // put two entries in the lead's history for a single "Enrich & Save" —
      // one listing what enrichment actually added, one re-listing every field
      // the lead already had. Only log from here when enrichment never ran,
      // which is the one case the server could not record.
      if (enrichmentFailed) {
        await supabase.from('enrichment_history').insert({
          user_id: userId,
          lead_id: savedLead.id,
          fields_enriched: enrichedFieldsPresent({
            company_name: lead.company_name,
            contact_name: lead.contact_name,
            contact_email: email,
            industry: lead.industry,
            company_size: lead.company_size,
            job_title: lead.job_title,
            linkedin_url: lead.linkedin_url,
            icp_score: lead.scores.icp_score,
          }),
          source: 'OutReign',
          status: 'failed',
          error_message: 'Enrichment could not be completed for this lead.',
        });
      }

      toast(saveToast({
        hadEmail: !!email,
        foundEmail,
        foundPhone,
        foundPhoneType,
        enrichmentFailed,
        contactName: lead.contact_name,
        companyName: lead.company_name,
      }));

      posthog.capture('lead_enriched', {
        overall_score: lead.scores.overall_score,
        has_linkedin_profile: Boolean(lead.linkedin_url),
        has_email: Boolean(email || foundEmail),
        enriched_on_save: !email,
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
    setDisclosure(EMPTY_DISCLOSURE);
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
    removedUndeliverable,
    fetchLeads,
    activateLead,
    clearLeads,
    goToPage,
  };
}
