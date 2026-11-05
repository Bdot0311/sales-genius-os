import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The Saved Leads list, filtered and sorted by the database.
 *
 * It used to page through leads a thousand at a time with select("*") — every
 * column, research briefs and notes included — up to twenty thousand rows into
 * browser memory, then filter and sort them in a useMemo. That meant a
 * multi-megabyte payload on every visit, a silent ceiling where lead 20,001 did
 * not exist and nothing said so, and filter dropdowns whose options were built
 * from whatever happened to be loaded.
 *
 * search_saved_leads does the whole thing in one round trip, including the join
 * to lead_decisions that the AI priority and next-step filters need. The join
 * has to happen before the limit or "hot leads" means "hot leads on this page".
 */
export interface SavedLeadFilters {
  search: string;
  intentLabel: string;
  industry: string;
  companySize: string;
  seniority: string;
  stage: string;
  priority: string;
  nextStep: string;
  /**
   * The A/B/C grade from lead-scoring.ts, or "unscored".
   *
   * Computed, stored and shown as a pill since 20260726000000, and until now
   * impossible to select on. B is the segment worth having: strong enough fit
   * to be worth an email, no fired signal to make a human pick it, so nobody
   * ever works it.
   */
  tier: string;
  /**
   * "enriched" / "not-enriched" / "all".
   *
   * The enrichment badge was the only way to tell, which meant scrolling the
   * whole list to find the leads worth spending enrichment credits on.
   */
  enriched: string;
}

export const EMPTY_FILTERS: SavedLeadFilters = {
  search: "",
  intentLabel: "all",
  industry: "all",
  companySize: "all",
  seniority: "all",
  stage: "all",
  priority: "all",
  nextStep: "all",
  tier: "all",
  enriched: "all",
};

/** Whether the user has narrowed anything. Drives "no leads" vs "none match". */
export const hasActiveFilters = (f: SavedLeadFilters): boolean =>
  f.search.trim() !== "" ||
  (Object.keys(f) as (keyof SavedLeadFilters)[])
    .filter((k) => k !== "search")
    .some((k) => f[k] !== "all");

export const activeFilterCount = (f: SavedLeadFilters): number =>
  (f.search.trim() ? 1 : 0) +
  (Object.keys(f) as (keyof SavedLeadFilters)[])
    .filter((k) => k !== "search")
    .filter((k) => f[k] !== "all").length;

/** "all" is the UI's word for no filter; the function wants null. */
const orNull = (v: string): string | null => (v && v !== "all" ? v : null);

export interface SavedLeadsPage<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: string | null;
}

export interface Facets {
  industries: string[];
  company_sizes: string[];
  seniorities: string[];
  /** How many leads carry each grade, keyed A/B/C/unscored. */
  tiers: Record<string, number>;
  total: number;
}

export const useSavedLeads = <T,>(
  filters: SavedLeadFilters,
  sort: { field: string; desc: boolean },
  page: number,
  pageSize: number,
  show: string | null = null,
  onPageOutOfRange?: (lastPage: number) => void,
) => {
  const [state, setState] = useState<SavedLeadsPage<T>>({
    rows: [],
    total: 0,
    loading: true,
    error: null,
  });
  // Rising number per request: a slow first query must not overwrite a fast
  // second one, which is how a filtered list ends up showing unfiltered rows.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    const { data, error } = await supabase.rpc("search_saved_leads" as never, {
      p_search: filters.search.trim() || null,
      p_intent_label: orNull(filters.intentLabel),
      p_industry: orNull(filters.industry),
      p_company_size: orNull(filters.companySize),
      p_seniority: orNull(filters.seniority),
      p_stage: orNull(filters.stage),
      p_priority: orNull(filters.priority),
      p_next_step: orNull(filters.nextStep),
      p_tier: orNull(filters.tier),
      p_sort: sort.field,
      p_desc: sort.desc,
      p_limit: pageSize,
      p_offset: page * pageSize,
      p_show: show,
    } as never);

    if (id !== requestId.current) return;

    if (error) {
      setState({ rows: [], total: 0, loading: false, error: error.message });
      return;
    }
    const rows = (data as unknown as (T & { total_count: number })[]) ?? [];
    // An empty page past the first (e.g. after deleting everything on it)
    // does not mean zero leads. Ask for the real total and step back.
    if (rows.length === 0 && page > 0 && onPageOutOfRange) {
      const { data: probe } = await supabase.rpc("search_saved_leads" as never, {
        p_search: filters.search.trim() || null,
        p_intent_label: orNull(filters.intentLabel),
        p_industry: orNull(filters.industry),
        p_company_size: orNull(filters.companySize),
        p_seniority: orNull(filters.seniority),
        p_stage: orNull(filters.stage),
        p_priority: orNull(filters.priority),
        p_next_step: orNull(filters.nextStep),
        p_tier: orNull(filters.tier),
        p_limit: 1,
        p_offset: 0,
        p_show: show,
      } as never);
      if (id !== requestId.current) return;
      const probeRows = (probe as unknown as { total_count: number }[]) ?? [];
      const trueTotal = probeRows.length ? Number(probeRows[0].total_count ?? 0) : 0;
      onPageOutOfRange(Math.max(0, Math.ceil(trueTotal / pageSize) - 1));
      return;
    }
    setState({
      rows,
      // The window count rides on every row, so an empty page legitimately
      // means zero rather than an unknown total.
      total: rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0,
      loading: false,
      error: null,
    });
  }, [filters, sort.field, sort.desc, page, pageSize, show, onPageOutOfRange]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Change one row in place, without refetching.
   *
   * Inline stage editing and the realtime subscription both need this. Going
   * back to the server for a field the client already knows would make an
   * edit feel slower than it is, and would fight the optimistic rollback the
   * page already does on failure.
   */
  const patchRow = useCallback((id: string, changes: Partial<T>) => {
    setState((s) => ({
      ...s,
      rows: s.rows.map((r) =>
        (r as unknown as { id: string }).id === id ? { ...r, ...changes } : r,
      ),
    }));
  }, []);

  /**
   * Every row matching the current filters, for export.
   *
   * The page exported the array it had in memory. Once the list is paged
   * server-side that would quietly export page one and call it the export,
   * which is the silent truncation this whole change exists to remove. So it
   * pages the query, and the caller gets the whole filtered set or an error.
   */
  const fetchAllMatching = useCallback(async (): Promise<T[]> => {
    const out: T[] = [];
    const size = 200;
    for (let offset = 0; offset < 100_000; offset += size) {
      const { data, error } = await supabase.rpc("search_saved_leads" as never, {
        p_search: filters.search.trim() || null,
        p_intent_label: orNull(filters.intentLabel),
        p_industry: orNull(filters.industry),
        p_company_size: orNull(filters.companySize),
        p_seniority: orNull(filters.seniority),
        p_stage: orNull(filters.stage),
        p_priority: orNull(filters.priority),
        p_next_step: orNull(filters.nextStep),
        p_tier: orNull(filters.tier),
        p_sort: sort.field,
        p_desc: sort.desc,
        p_limit: size,
        p_offset: offset,
        p_show: show,
      } as never);
      if (error) throw new Error(error.message);
      const batch = (data as unknown as T[]) ?? [];
      out.push(...batch);
      if (batch.length < size) break;
    }
    return out;
  }, [filters, sort.field, sort.desc, show]);

  return { ...state, refresh: load, patchRow, fetchAllMatching };
};

/**
 * What the filter dropdowns offer, asked of the whole account.
 *
 * Built from the rows in memory before, so the Industries list changed
 * depending on what had loaded — a control that quietly lied about its own
 * options.
 */
export const useLeadFacets = () => {
  const [facets, setFacets] = useState<Facets>({
    industries: [],
    company_sizes: [],
    seniorities: [],
    tiers: {},
    total: 0,
  });

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("saved_lead_facets" as never);
    if (data) setFacets(data as unknown as Facets);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { facets, refresh: load };
};
