/**
 * The releasable first touch the evidence policy defines: greeting, one
 * approved research sentence copied verbatim, one ask, the sender's name.
 * Used only when every model draft added a claim the research does not say.
 */
export const FALLBACK_ASK = "Worth a look?";

export function releasableFirstTouch(input: { firstName: string; fact: string; senderName: string }): string {
  const first = input.firstName.trim() || "there";
  const fact = input.fact.trim().replace(/\s+/g, " ");
  const sentence = /[.!?]$/.test(fact) ? fact : `${fact}.`;
  return `Hi ${first},\n\n${sentence}\n\n${FALLBACK_ASK}\n\n${input.senderName.trim()}`;
}

/** A sentence a person could read aloud: no markdown, links, headings or brackets, sensible length. */
export function usableFallbackFact(span: string): boolean {
  const text = span.trim();
  if (text.length < 25 || text.length > 240) return false;
  if (/[\[\]{}<>#*|]|https?:\/\/|\(\s*https?/i.test(text)) return false;
  return /^[A-Z0-9"'ÀØ]/.test(text);
}

/** Subject taken from the approved sentence itself, so it is never a new claim. */
export function fallbackSubjectFrom(span: string): string {
  return span.trim().split(/\s+/).slice(0, 6).join(" ").replace(/[.!?,;:]+$/g, "");
}
