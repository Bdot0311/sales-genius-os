DROP POLICY IF EXISTS "Users can update own deliverability preferences" ON public.deliverability_preferences;
CREATE POLICY "Users can update own deliverability preferences"
ON public.deliverability_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);