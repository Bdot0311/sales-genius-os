CREATE POLICY "Admins can view all onboarding responses"
ON public.onboarding_responses
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));