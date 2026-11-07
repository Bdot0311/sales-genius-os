GRANT ALL ON TABLE public.stripe_credit_grants TO service_role;
INSERT INTO public.schema_contract (table_name, column_name, note) VALUES
('stripe_credit_grants', 'event_id', 'Invoice credit grants are recorded once per Stripe event'),
('stripe_credit_grants', 'user_id', 'Invoice credit grants retain their subscription owner'),
('stripe_credit_grants', 'delta', 'Atomic invoice allowance increment'),
('stripe_credit_grants', 'created_at', 'Invoice credit grant audit timestamp');
