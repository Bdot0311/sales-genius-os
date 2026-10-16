/*
 * The recovery path was unreachable in exactly the case it exists for, and
 * one unrelated lead could abort it.
 *
 * Both found in review of 20261016010000, both confirmed against a cluster.
 *
 * ── 1. The sweep never ran when it mattered most ────────────────────────
 *
 * The stale-claim sweep lives at the top of the drain, and the drain is only
 * ever called by `trigger_rescore_queue`, which opens with:
 *
 *     SELECT count(*) INTO pending_ct ... WHERE status = 'pending';
 *     IF pending_ct = 0 THEN RETURN; END IF;
 *
 * A run that dies after claiming the last batch leaves rows in 'processing'
 * and none in 'pending'. The count is zero, the trigger returns, the drain is
 * never called, and the sweep inside it never runs — so those rows stay
 * 'processing' forever. The fix shipped one migration ago was reachable only
 * while something else was already queued, which is precisely not the stuck
 * case.
 *
 * The sweep now runs before the count, so recovered rows are counted and
 * drained on the same tick. This is the shape `trigger_agent_jobs` already
 * uses — `PERFORM public.release_stale_agent_job_items();` as its first
 * statement — and the reason it uses it.
 *
 * ── 2. One conflicting lead aborted recovery for every other ────────────
 *
 * `uq_rescore_queue_pending_lead` is unique on `lead_id` WHERE status =
 * 'pending'. It does not cover 'processing', so while a row for a lead is
 * claimed, a new signal can enqueue a second, pending row for the same lead —
 * legitimately. Handing the claimed row back to 'pending' then violates the
 * index.
 *
 * Both release functions did that as one set-based UPDATE, so a single
 * conflicting lead raised, rolled the statement back, and took every other
 * lead's recovery with it — including, in the sweep, the later move of
 * exhausted rows to 'error'. One lead with a coincidence of timing could
 * freeze recovery for the whole queue.
 *
 * So the release is per row with its own exception block. A conflict is
 * contained to the row that caused it, and that row is dropped rather than
 * left stuck: a newer pending row already covers that lead, so the claimed
 * one is a subsumed duplicate, which is exactly what the unique index means —
 * one outstanding rescore per lead is enough. Handling it in the exception
 * rather than by a prior EXISTS check is deliberate: a check would still lose
 * to an enqueue that lands between the check and the update.
 */

/*
 * Hand back a claim this run will not use.
 *
 * Per row, so a conflict cannot take the batch with it. The attempt is given
 * back because nothing was tried — three budget stops in a row would otherwise
 * retire a lead no rescore was ever attempted for.
 */
CREATE OR REPLACE FUNCTION public.release_rescore_items(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  released integer := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT id FROM public.rescore_queue
     WHERE id = ANY(p_ids) AND status = 'processing'
  LOOP
    BEGIN
      UPDATE public.rescore_queue
         SET status = 'pending', claimed_at = NULL, attempts = GREATEST(attempts - 1, 0)
       WHERE id = r.id AND status = 'processing';
      released := released + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Subsumed: a newer pending row already asks for this lead.
      DELETE FROM public.rescore_queue WHERE id = r.id AND status = 'processing';
    END;
  END LOOP;
  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_rescore_items(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rescore_items(uuid[]) TO service_role;

/*
 * A claim nobody came back for.
 *
 * Fifteen minutes is past the platform's own kill time for an edge function.
 * Rescoring is idempotent — it recomputes from the lead and its signals — so
 * unlike a send there is no risk in retrying, and the only question is how
 * many times before calling it a bad row.
 */
CREATE OR REPLACE FUNCTION public.release_stale_rescore_items()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  released integer := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT id FROM public.rescore_queue
     WHERE status = 'processing'
       AND claimed_at < now() - interval '15 minutes'
       AND attempts < 3
  LOOP
    BEGIN
      UPDATE public.rescore_queue
         SET status = 'pending', claimed_at = NULL
       WHERE id = r.id AND status = 'processing';
      released := released + 1;
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM public.rescore_queue WHERE id = r.id AND status = 'processing';
    END;
  END LOOP;

  /*
   * Three times is enough to tell an interrupted run from a row that cannot
   * be scored. 'error' is not in the unique index, so this one cannot
   * conflict — and it now runs whatever happened above, rather than being
   * rolled back by one unlucky lead.
   */
  UPDATE public.rescore_queue
     SET status = 'error', processed_at = now()
   WHERE status = 'processing'
     AND claimed_at < now() - interval '15 minutes'
     AND attempts >= 3;

  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_rescore_items() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_rescore_items() TO service_role;

/*
 * Sweep first, then decide whether there is anything to drain.
 *
 * Everything below the first statement is carried over unchanged from the
 * live definition, which signs with `internal_job_key()` rather than the anon
 * key the earlier copy in supabase/migrations still uses. The drain is behind
 * `requireServiceRole`, which rejects the anon key outright — so rewriting
 * this from the older copy would have 401'd the whole queue. Checked before
 * editing, not after.
 */
CREATE OR REPLACE FUNCTION public.trigger_rescore_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_url  text;
  config_key  text;
  pending_ct  integer;
BEGIN
  -- Before the count, or a queue whose last batch was stranded looks empty
  -- and the recovery inside the drain is never reached.
  PERFORM public.release_stale_rescore_items();

  SELECT count(*) INTO pending_ct FROM public.rescore_queue WHERE status = 'pending';
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url'
    INTO config_url
    FROM admin_settings WHERE setting_key = 'supabase_config';

  IF config_url IS NULL THEN
    SELECT value INTO config_url FROM public.deliverability_settings WHERE key = 'supabase_url';
  END IF;

  config_key := public.internal_job_key();

  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_rescore_queue: edge credentials missing; skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/process-rescore-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
    body := jsonb_build_object('batch', 50)
  );
END;
$$;
