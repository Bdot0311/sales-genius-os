export interface BouncedSend { lead_id: string | null; to_email: string }

/** A corrected address must never inherit the old address's bounce badge. */
export function leadHasBounce(lead: { id: string; contact_email: string }, sends: BouncedSend[]): boolean {
  const email = lead.contact_email.trim().toLowerCase();
  return !!email && sends.some((s) => s.lead_id === lead.id && s.to_email.trim().toLowerCase() === email);
}