DO $$
DECLARE
  t record;
  cols text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('api_keys', 'key'),
      ('webhooks', 'secret'),
      ('integrations', 'config')
    ) AS v(tbl, secret_col)
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', t.tbl);

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = t.tbl
       AND column_name <> t.secret_col;

    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, t.tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.tbl);
  END LOOP;
END $$;