/** One generator invocation per recipient; never distribute a preview as campaign copy. */
export async function personalizedOutreach(
  invoke: (body: Record<string, unknown>) => Promise<{ data: any; error?: unknown }>,
  input: Record<string, unknown> & { lead: { id: string } },
): Promise<{ subject: string; body: string }> {
  const { data, error } = await invoke({ ...input, saveDraft: false });
  if (error || data?.error) throw new Error(String(data?.error || "Personalized generation failed. Please retry."));
  if (data?.quality_status !== "clear" || data?.quality_weak === true || !data?.evidence_id) {
    throw new Error("Research or quality checks did not approve this recipient's email.");
  }
  const text = String(data?.email ?? "").trim();
  const match = text.match(/^subject\s*:\s*([^\n]+)\n+([\s\S]+)$/i);
  if (!match?.[1]?.trim() || !match?.[2]?.trim()) {
    throw new Error("The personalized email is missing a subject or body.");
  }
  return { subject: match[1].trim(), body: match[2].trim() };
}

export function selectLeadCount<T extends { id: string }>(leads: T[], count: number | "all"): string[] {
  return [...new Set((count === "all" ? leads : leads.slice(0, Math.max(0, count))).map(l => l.id))];
}