/*
 * Stopping a sequence did not stop the mail already in the queue.
 *
 * Five holes in the reply handling that shipped an hour ago, all the same
 * shape: the decision was made correctly and then did not reach everything
 * that acts on it.
 *
 * ── 1. The email already queued still went out ─────────────────────────
 *
 * process-sequence-step writes a `sent_emails` row at status 'scheduled'
 * BEFORE the enrollment's next_action_at moves on, and process-scheduled-emails
 * sends whatever is scheduled and due. It contains no reference to
 * `sequence_enrollments` at all — verified: the word "enrollment" does not
 * appear in that function.
 *
 * So a reply that stops a sequence does not stop the follow-up already sitting
 * in the queue, and a hold until March does not stop the one queued for
 * tomorrow. The prospect answers and gets the next step anyway, which is the
 * exact outcome the whole change exists to prevent.
 *
 * Both halves are needed. Cancelling here closes the common case at the
 * moment of the decision; the check in the sender closes the window between
 * the row being queued and this function running, and covers every other way
 * an enrollment can stop.
 *
 * ── 2. A hold could not be stopped by a later reply ────────────────────
 *
 * The stop branch matched `status = 'active'` only. Once a dated soft_no had
 * held an enrollment, a later hard_no — or a positive reply, or a question —
 * could not end it, and the sweep restarted it on the old date with the
 * enrollment never marked replied. A later answer always outranks an earlier
 * one, so the stop now takes held enrollments too and clears the hold.
 *
 * ── 3. A hold outlived a pause someone else applied ────────────────────
 *
 * check-handoff-triggers pauses an enrollment and sets paused_reason, leaving
 * paused_until untouched. An enrollment held until March and then paused for a
 * handoff was still resumed in March by the sweep, undoing a pause applied for
 * a different reason entirely. Its pause is not time-boxed, so it clears the
 * date — handled in that function, with the guard here.
 */

/*
 * Cancel the mail a stopped or held enrollment has already queued.
 *
 * Only rows that have not gone out: 'scheduled' is the one status
 * process-scheduled-emails will pick up, and anything already sent is history
 * rather than a plan.
 */
CREATE OR REPLACE FUNCTION public.cancel_queued_sequence_mail(
  p_enrollment_id uuid,
  p_reason        text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'cancel_queued_sequence_mail is internal';
  END IF;

  UPDATE public.sent_emails
     SET status = 'cancelled',
         error_message = left(coalesce(p_reason, 'Sequence stopped'), 500)
   WHERE enrollment_id = p_enrollment_id
     AND status = 'scheduled';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_queued_sequence_mail(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_queued_sequence_mail(uuid, text) TO service_role;

/*
 * The decision, with the queue included and a hold no longer immovable.
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
  v_cancelled  integer := 0;
  v_row        record;
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
    FOR v_row IN
      UPDATE public.sequence_enrollments
         SET status = 'paused',
             paused_until = p_check_back_at,
             paused_reason = 'They asked to be contacted later',
             next_action_at = p_check_back_at,
             last_activity_at = now()
       WHERE user_id = p_user_id
         AND lead_id = p_lead_id
         AND status = 'active'
      RETURNING id
    LOOP
      v_affected := v_affected + 1;
      /*
       * A held sequence must not deliver the step it queued yesterday. The
       * hold is a promise about when they hear from us next, and an email
       * already in the queue would break it tomorrow.
       */
      v_cancelled := v_cancelled + public.cancel_queued_sequence_mail(
        v_row.id, 'Held until ' || to_char(p_check_back_at, 'YYYY-MM-DD') || ' at their request'
      );
    END LOOP;
    v_action := 'held';
  ELSE
    FOR v_row IN
      UPDATE public.sequence_enrollments
         SET status = 'completed',
             engagement_state = 'replied',
             -- A hold is not a reason to keep going; clear it so the sweep
             -- cannot resurrect an enrollment a later reply ended.
             paused_until = NULL,
             paused_reason = NULL,
             completed_at = now(),
             last_activity_at = now()
       WHERE user_id = p_user_id
         AND lead_id = p_lead_id
         -- Held enrollments too: a later answer outranks an earlier one.
         AND status IN ('active', 'paused')
      RETURNING id
    LOOP
      v_affected := v_affected + 1;
      v_cancelled := v_cancelled + public.cancel_queued_sequence_mail(
        v_row.id, 'They replied, so the rest of the sequence was cancelled'
      );
    END LOOP;
    v_action := 'stopped';
  END IF;

  UPDATE public.leads
     SET engagement_state = 'replied'
   WHERE id = p_lead_id
     AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'action', v_action,
    'enrollments', v_affected,
    'cancelled_queued', v_cancelled,
    'check_back_at', p_check_back_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_reply_to_sequence(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reply_to_sequence(uuid, uuid, text, timestamptz) TO service_role;
