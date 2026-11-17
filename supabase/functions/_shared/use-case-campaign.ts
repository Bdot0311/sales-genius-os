export type UseCaseCampaign = "three_ideas" | "one_sentence";

export function useCaseCampaignFor(template: string, instruction = ""): UseCaseCampaign | null {
  if (template === "three_ideas" || template === "one_sentence") return template;
  if (/\b(?:3|three)[ -](?:specific[ -])?ideas?\b/i.test(instruction)) return "three_ideas";
  if (/\b(?:one|1|single)[ -]sentence\b/i.test(instruction)) return "one_sentence";
  return null;
}

export const USE_CASE_PRINCIPLES = `
RESEARCH-LED USE-CASE CAMPAIGNS:
Personalization means understanding how the sender can help this business, not demonstrating how many facts you found.
Read the verified prospect evidence for its business model, customers and workflows, then match it to capabilities explicitly supplied by the sender.
Three-idea option: exactly three distinct, tangible applications tied to this business, not three product features or the same benefit rephrased.
One-sentence option: one specific application and a low-commitment question combined into a single natural sentence.
Use these as alternative shapes when supported by the evidence, not mandatory additions to every email. Never reuse the same ideas across unrelated prospects.
Ideas are proposals (could/might), not claims that the prospect has a problem or that results are guaranteed. Every factual premise still needs approved evidence.
Never invent sender capabilities, internal workflows, complaints, integrations, proof, metrics or urgency. Do not repeat a social-media claim of tripled response rates.
If the evidence cannot support three useful ideas, choose one supported application rather than padding the list. If no relevant application is supported, request more research rather than guess.
No feature list, product introduction, exaggerated proof or research name-dropping. Existing research, evidence and quality gates remain mandatory.`;

export function useCaseCampaignPrompt(strategy: UseCaseCampaign): string {
  return `You write researched B2B emails using the ${strategy === "three_ideas" ? "three-idea" : "one-sentence"} campaign.
${USE_CASE_PRINCIPLES}
SELECTED SHAPE overrides generic framework, paragraph, minimum-length, PS and one-idea preferences only; it never overrides evidence, safety, banned language or quality rules.
${strategy === "three_ideas"
    ? "Write exactly three distinct supported use cases as three short plain-text lines, followed by one low-commitment question. Keep the body under 75 words. No extra observation paragraph, feature list or PS. If three ideas are not supported, do not present the draft as a three-idea campaign."
    : "Write exactly ONE sentence in the body, at most 35 words, combining one concrete application for this company with a single low-commitment question. No separate opener, proof paragraph, CTA sentence or PS. Do not pad it to meet a minimum word count."}
Greeting and sender sign-off are outside the body. Use the sender's own identity. Return only the email, never strategy commentary.`;
}