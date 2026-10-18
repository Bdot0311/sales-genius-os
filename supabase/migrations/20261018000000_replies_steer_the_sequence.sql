/*
 * A reply did not stop the sequence. It does not read it either.
 *
 * `process-sequence-step` has always had the guard:
 *
 *     if (enrollment.engagement_state === 'replied') { ...complete... }
 *
 * and that read is the ONLY reference to the value in the repository. Nothing
 * writes it. `update-lead-engagement-state` contains the write and has no
 * caller — not inbox-sync, which stamps `sent_emails.replied_at` and moves on;
 * not analyze-reply, which classifies the reply into `reply_analysis` and
 * stops there. So the guard is unreachable, and a prospect who answers keeps
 * receiving the rest of the sequence.
 *
 * In cold outreach that is the worst thing the product can do to the one
 * person who engaged, and it is what earns complaints.
 *
 * ── Reading the reply, not just noticing it ────────────────────────────
 *
 * analyze-reply already classifies into
 * positive | soft_no | hard_no | ooo | wrong_person | info_request, which is
 * most of the vocabulary needed. Two things were missing: a date for "not
 * now", and somewhere for the answer to a question to go. Both are added to
 * `reply_analysis`, and `apply_reply_to_sequence` turns the classification
 * into the one decision the sequence cares about — stop, hold, or ignore.
 *
 *   ooo                      ignore. An auto-reply is not a reply; inbox-sync
 *                            already identifies it from the mail headers,
 *                            which a model reading the body cannot improve on.
 *   soft_no WITH a date      hold until that date, then resume.
 *   soft_no WITHOUT a date   stop. "Not now, try me in March" is a timeline;
 *                            "not right now" with nothing after it is a
 *                            decline, and guessing a date for it would invent
 *                            consent to mail someone again.
 *   everything else          stop. positive and info_request stop too: the
 *                            sequence's job was to start a conversation, and
 *                            it worked.
 */

ALTER TABLE public.sequence_enrollments
  /*
   * When a held enrollment comes back. NULL is the important case: a user who
   * pauses a sequence themselves gets no date, and must never be auto-resumed
   * by the sweep below. Only a reply that named a time sets this.
   */
  ADD COLUMN IF NOT EXISTS paused_until timestamptz;

ALTER TABLE public.reply_analysis
  -- The date the prospect named, when they named one.
  ADD COLUMN IF NOT EXISTS check_back_at timestamptz,
  -- A draft answer to a reply that asked something, for the user to edit.
  ADD COLUMN IF NOT EXISTS suggested_reply text;

/*
 * The sweep's access path: held enrollments whose date has come.
 * Partial, so it stays the size of what is actually on hold.
 */
CREATE INDEX IF NOT EXISTS idx_enrollments_resume_due
  ON public.sequence_enrollments (paused_until)
  WHERE status = 'paused' AND paused_until IS NOT NULL;

/*
 * Turn a classified reply into the sequence's decision.
 *
 * One statement per outcome, in one transaction, because the three writes have
 * to agree: an enrollment left active with a lead marked replied keeps
 * sending, and a lead left unmarked with the enrollment stopped loses the
 * reason it stopped.
 *
 * Returns what it did rather than nothing, so the caller can log it and a test
 * can assert on it instead of inferring from side effects.
 */
CREATE OR REPLACE FUNCTION public.apply_reply_to_sequence(
  p_user_id       uuid,
  p_lead_id       uuid,
  p_triage        text,
  p_check_back_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action     text;
  v_affected   integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'apply_reply_to_sequence is internal';
  END IF;

  IF p_lead_id IS NULL THEN
    RETURN jsonb_build_object('action', 'none', 'reason', 'no lead on the reply');
  END IF;

  -- An auto-reply is not a reply. Nothing moves.
  IF p_triage = 'ooo' THEN
    RETURN jsonb_build_object('action', 'ignored', 'reason', 'auto-reply');
  END IF;

  IF p_triage = 'soft_no' AND p_check_back_at IS NOT NULL AND p_check_back_at > now() THEN
    UPDATE public.sequence_enrollments
       SET status = 'paused',
           paused_until = p_check_back_at,
           paused_reason = 'They asked to be contacted later',
           next_action_at = p_check_back_at,
           last_activity_at = now()
     WHERE user_id = p_user_id
       AND lead_id = p_lead_id
       AND status = 'active';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_action := 'held';
  ELSE
    /*
     * engagement_state is what process-sequence-step reads, and it is set here
     * as well as the status so the guard there holds even if an enrollment is
     * re-activated by hand later.
     */
    UPDATE public.sequence_enrollments
       SET status = 'completed',
           engagement_state = 'replied',
           completed_at = now(),
           last_activity_at = now()
     WHERE user_id = p_user_id
       AND lead_id = p_lead_id
       AND status = 'active';
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_action := 'stopped';
  END IF;

  UPDATE public.leads
     SET engagement_state = 'replied'
   WHERE id = p_lead_id
     AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'action', v_action,
    'enrollments', v_affected,
    'check_back_at', p_check_back_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_reply_to_sequence(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reply_to_sequence(uuid, uuid, text, timestamptz) TO service_role;

/*
 * Bring back the enrollments whose check-back date has arrived.
 *
 * Only ones holding a date. A sequence someone paused by hand has
 * `paused_until IS NULL` and stays paused until they say otherwise — being
 * restarted by a sweep they did not ask for is worse than staying stopped.
 *
 * Called at the top of dispatch-sequence-steps rather than from a cron of its
 * own: that function already runs on a schedule and already owns the question
 * of what is due, and a second schedule is a second thing to go wrong.
 */
CREATE OR REPLACE FUNCTION public.resume_due_enrollments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'resume_due_enrollments is internal';
  END IF;

  UPDATE public.sequence_enrollments
     SET status = 'active',
         paused_until = NULL,
         paused_reason = NULL,
         next_action_at = now(),
         last_activity_at = now()
   WHERE status = 'paused'
     AND paused_until IS NOT NULL
     AND paused_until <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_due_enrollments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_due_enrollments() TO service_role;
