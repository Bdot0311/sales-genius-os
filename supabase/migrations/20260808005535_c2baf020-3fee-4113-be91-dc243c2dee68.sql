-- Re-queue the one outbound email that was wrongly dead-lettered by the
-- 403 mis-classification, so it actually reaches the recipient.
DO $$
DECLARE m jsonb;
BEGIN
  SELECT message INTO m FROM pgmq.q_transactional_emails_dlq WHERE msg_id = 34;
  IF m IS NOT NULL THEN
    PERFORM pgmq.send('transactional_emails', m);
    PERFORM pgmq.delete('transactional_emails_dlq', 34::bigint);
  END IF;
END $$;