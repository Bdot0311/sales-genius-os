export function generatedDraftFields(input: {
  userId: string; leadId: string; email: string; subject: string; tone: string;
}) {
  const match = input.email.match(/^Subject:\s*([^\n]+)\r?\n+/i);
  return {
    user_id: input.userId,
    lead_id: input.leadId,
    subject: match?.[1]?.trim() || input.subject || "(no subject)",
    body: match ? input.email.slice(match[0].length).trim() : input.email.trim(),
    tone: input.tone,
  };
}