/** Save a provider connection without assuming the removed user/provider constraint. */
export async function saveIntegration(
  client: { from: (table: string) => any },
  userId: string,
  provider: string,
  name: string,
  config: Record<string, unknown>,
  connectedEmail: string | null = null,
) {
  const { data: existing, error: lookupError } = await client.from("integrations")
    .select("id").eq("user_id", userId).eq("integration_id", provider)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError) throw new Error("Could not read your connection. Please try again.");
  const values = { config, is_active: true, connected_email: connectedEmail, updated_at: new Date().toISOString() };
  const result = existing
    ? await client.from("integrations").update(values).eq("id", existing.id).eq("user_id", userId).select("id").single()
    : await client.from("integrations").insert({ ...values, user_id: userId, integration_id: provider, integration_name: name }).select("id").single();
  if (result.error || !result.data) throw new Error("Could not save your connection. Please try again.");
  return result.data.id as string;
}