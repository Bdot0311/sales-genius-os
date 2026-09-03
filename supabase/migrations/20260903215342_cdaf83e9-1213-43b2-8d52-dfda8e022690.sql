CREATE OR REPLACE FUNCTION public.record_deliverability_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_title text;
  v_detail text := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.demo_seed THEN RETURN OLD; END IF;
  ELSIF NEW.demo_seed THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sending_accounts' THEN
    IF TG_OP = 'INSERT' THEN
      v_type := 'mailbox_added';
      v_title := format('Mailbox %s connected', NEW.email);

    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.deliverability_events (user_id, sending_account_id, event_type, title)
      VALUES (OLD.user_id, NULL, 'mailbox_removed', format('Mailbox %s removed', OLD.email));
      RETURN OLD;

    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'active' THEN
          v_type := 'mailbox_resumed';
          v_title := format('Mailbox %s resumed', NEW.email);
        ELSE
          v_type := 'mailbox_paused';
          v_title := format('Mailbox %s %s', NEW.email, NEW.status);
          v_detail := NEW.paused_reason;
        END IF;

      ELSIF NEW.daily_limit IS DISTINCT FROM OLD.daily_limit THEN
        v_type := 'limit_changed';
        v_title := format('Daily limit for %s changed from %s to %s',
                          NEW.email, OLD.daily_limit, NEW.daily_limit);
        IF OLD.daily_limit > 0 AND NEW.daily_limit > OLD.daily_limit * 2 THEN
          v_detail := 'More than doubled. Sudden volume increases are a common cause of placement drops.';
        END IF;

      ELSIF NEW.warmup_enabled IS DISTINCT FROM OLD.warmup_enabled THEN
        v_type := CASE WHEN NEW.warmup_enabled THEN 'warmup_started' ELSE 'warmup_completed' END;
        v_title := format('Warmup %s for %s',
                          CASE WHEN NEW.warmup_enabled THEN 'started' ELSE 'turned off' END,
                          NEW.email);
      ELSE
        RETURN NEW;
      END IF;
    END IF;

    INSERT INTO public.deliverability_events (user_id, sending_account_id, event_type, title, detail)
    VALUES (NEW.user_id, NEW.id, v_type, v_title, v_detail);
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sending_domains' THEN
    IF TG_OP = 'UPDATE' AND (
         NEW.spf_status IS DISTINCT FROM OLD.spf_status
      OR NEW.dkim_status IS DISTINCT FROM OLD.dkim_status
      OR NEW.dmarc_status IS DISTINCT FROM OLD.dmarc_status
    ) THEN
      INSERT INTO public.deliverability_events (user_id, domain, event_type, title, detail, metadata)
      VALUES (
        NEW.user_id, NEW.domain, 'auth_record_changed',
        format('Authentication changed on %s', NEW.domain),
        format('SPF %s→%s, DKIM %s→%s, DMARC %s→%s',
               OLD.spf_status, NEW.spf_status,
               OLD.dkim_status, NEW.dkim_status,
               OLD.dmarc_status, NEW.dmarc_status),
        jsonb_build_object(
          'spf', jsonb_build_array(OLD.spf_status, NEW.spf_status),
          'dkim', jsonb_build_array(OLD.dkim_status, NEW.dkim_status),
          'dmarc', jsonb_build_array(OLD.dmarc_status, NEW.dmarc_status)
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sending_accounts_events ON public.sending_accounts;
CREATE TRIGGER trg_sending_accounts_events
  AFTER INSERT OR UPDATE OR DELETE ON public.sending_accounts
  FOR EACH ROW EXECUTE FUNCTION public.record_deliverability_event();

DROP TRIGGER IF EXISTS trg_sending_domains_events ON public.sending_domains;
CREATE TRIGGER trg_sending_domains_events
  AFTER UPDATE ON public.sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.record_deliverability_event();

COMMENT ON FUNCTION public.record_deliverability_event() IS
  'Writes deliverability_events from changes to sending_accounts and sending_domains. A trigger rather than inline inserts so every code path that changes a mailbox is captured, including ones written later.';