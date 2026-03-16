export type Classification = "interested" | "meeting" | "question" | "not_now" | "not_interested" | "ooo";

const CLASSIFICATION_RULES: { classification: Classification; triggers: string[] }[] = [
  {
    classification: "ooo",
    triggers: ["out of office", "on vacation", "away until", "returning", "auto-reply", "automatic reply"],
  },
  {
    classification: "not_interested",
    triggers: ["not interested", "remove me", "unsubscribe", "stop emailing", "don't contact", "no thanks"],
  },
  {
    classification: "meeting",
    triggers: ["book", "schedule", "calendar", "call", "zoom", "meet", "15 min", "30 min"],
  },
  {
    classification: "interested",
    triggers: ["sounds good", "tell me more", "interested", "yes", "when can we", "let's chat", "open to it", "would love"],
  },
  {
    classification: "not_now",
    triggers: ["not right now", "not the right time", "maybe later", "reach out in", "check back", "next quarter", "busy right now"],
  },
];

export function classifyReply(replyBody: string): Classification {
  const lower = replyBody.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    for (const trigger of rule.triggers) {
      if (lower.includes(trigger)) {
        return rule.classification;
      }
    }
  }

  return "question";
}

export const CLASSIFICATION_CONFIG: Record<Classification, { label: string; emoji: string; color: string }> = {
  interested: { label: "Interested", emoji: "🔥", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  meeting: { label: "Meeting", emoji: "📅", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  question: { label: "Question", emoji: "❓", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  not_now: { label: "Not Now", emoji: "⏰", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  not_interested: { label: "Not Interested", emoji: "❌", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  ooo: { label: "OOO", emoji: "🤖", color: "bg-muted text-muted-foreground border-border" },
};
