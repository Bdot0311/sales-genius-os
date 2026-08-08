/**
 * Demo mode guard shared by outbound edge functions.
 *
 * When the calling admin has demo mode on, we never touch a real provider and
 * never spend credits — the caller gets an instant simulated success so the
 * flow still looks complete on a sales call.
 */
export async function isDemoMode(
  client: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("is_demo_mode", { _user_id: userId });
    if (error) return false;
    return data === true;
  } catch (_e) {
    return false;
  }
}

export function demoResponse(body: Record<string, unknown>, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ success: true, demo: true, simulated: true, ...body }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
