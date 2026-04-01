-- Allow users to delete their own sent emails
CREATE POLICY "Users can delete own sent emails"
ON sent_emails FOR DELETE
USING (auth.uid() = user_id);
