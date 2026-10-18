/*
 * A reply could not reach a sequence that had just finished.
 *
 * The stop matched `status IN ('active', 'paused')`. That is right for an
 * enrollment that is still running, and wrong for the one case where a
 * finished sequence still has mail outstanding:
 *
 *   process-sequence-step queues the last step and, on the NEXT pass, finds
 *   no further step and marks the enrollment 'completed'. If a send cap or a
 *   paused mailbox has deferred that last email, the enrollment reads
 *   'completed' while its final email is still sitting in the queue.
 *
 * A reply arriving in that window hit neither branch: the enrollment was not
 * marked replied, and its queued mail was not cancelled — so the last
 * follow-up went out after the prospect had already answered. Which is the
 * single outcome this whole change exists to prevent, surviving in the one
 * state nobody thought to look at.
 *
 * So the stop also takes a completed enrollment that still has unsent mail.
 * Not every completed enrollment: one that finished and sent everything is
 * history, and re-closing it would rewrite completed_at for no reason. The
 * EXISTS is the whole distinction — there is something left to stop.
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
      UPDATE public.sequence_enrollments e
         SET status = 'paused',
             paused_until = p_check_back_at,
             paused_reason = 'They asked to be contacted later',
             next_action_at = p_check_back_at,
             last_activity_at = now()
       WHERE e.user_id = p_user_id
         AND e.lead_id = p_lead_id
         AND e.status = 'active'
      RETURNING e.id
    LOOP
      v_affected := v_affected + 1;
      v_cancelled := v_cancelled + public.cancel_queued_sequence_mail(
        v_row.id, 'Held until ' || to_char(p_check_back_at, 'YYYY-MM-DD') || ' at their request'
      );
    END LOOP;
    v_action := 'held';
  ELSE
    FOR v_row IN
      UPDATE public.sequence_enrollments e
         SET status = 'completed',
             engagement_state = 'replied',
             paused_until = NULL,
             paused_reason = NULL,
             completed_at = coalesce(e.completed_at, now()),
             last_activity_at = now()
       WHERE e.user_id = p_user_id
         AND e.lead_id = p_lead_id
         AND (
           e.status IN ('active', 'paused')
           /*
            * Or finished with mail still queued. The enrollment is already
            * 'completed', so the status does not change — what matters is
            * that engagement_state becomes 'replied', which is the signal the
            * sender reads, and that the loop below cancels what is pending.
            */
           OR (e.status = 'completed' AND EXISTS (
                 SELECT 1 FROM public.sent_emails s
                  WHERE s.enrollment_id = e.id
                    AND s.status = 'scheduled'))
         )
      RETURNING e.id
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
