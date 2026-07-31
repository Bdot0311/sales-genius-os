DROP POLICY "Users can update own contacts" ON public.contacts;
CREATE POLICY "Users can update own contacts" ON public.contacts
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);