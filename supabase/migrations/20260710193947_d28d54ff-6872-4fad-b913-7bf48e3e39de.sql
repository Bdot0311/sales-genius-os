
CREATE OR REPLACE FUNCTION public.admin_set_admin(_user_id uuid, _make_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  IF _user_id = auth.uid() AND NOT _make_admin THEN
    RAISE EXCEPTION 'You cannot remove your own admin privileges';
  END IF;

  IF _make_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.subscriptions
       SET account_status = 'admin'
     WHERE user_id = _user_id;
  ELSE
    DELETE FROM public.user_roles
     WHERE user_id = _user_id
       AND role = 'admin'::app_role;

    UPDATE public.subscriptions
       SET account_status = 'active'
     WHERE user_id = _user_id
       AND account_status = 'admin';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;
