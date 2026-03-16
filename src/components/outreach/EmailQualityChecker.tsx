import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface EmailQualityCheckerProps {
  subject: string;
  body: string;
}

interface CheckResult {
  label: string;
  status: "green" | "yellow" | "red";
  message: string;
  score: number; // 0-100
}

const HIGH_RISK_WORDS = [
  "free", "guarantee", "winner", "congratulations", "act now", "limited time",
  "click here", "unsubscribe", "earn money", "make money", "risk free",
  "no obligation", "special promotion",
];

const MEDIUM_RISK_WORDS = [
  "offer", "deal", "save", "discount", "exclusive", "bonus", "gift",
  "prize", "selected", "opportunity",
];

const ACTION_PHRASES = [
  "book a", "schedule a", "sign up", "register", "get started",
  "try it", "learn more", "let me know", "reply", "respond",
  "would you be open", "can we", "are you available", "let's connect",
  "worth a look", "15 minutes", "quick call", "happy to",
];

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function computeSpamScore(subject: string, body: string): CheckResult {
  const text = `${subject} ${body}`.toLowerCase();
  let score = 0;
  for (const word of HIGH_RISK_WORDS) {
    if (text.includes(word)) score += 3;
  }
  for (const word of MEDIUM_RISK_WORDS) {
    if (text.includes(word)) score += 1;
  }

  if (score <= 2) return { label: "Spam Score", status: "green", message: "Clean — no spam triggers detected", score: 100 };
  if (score <= 5) return { label: "Spam Score", status: "yellow", message: `${score} spam triggers found — review wording`, score: 60 };
  return { label: "Spam Score", status: "red", message: `${score} spam triggers — likely flagged as spam`, score: 20 };
}

function computeLengthCheck(body: string): CheckResult {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words < 50) return { label: "Length", status: "yellow", message: `${words} words — too short, add context`, score: 50 };
  if (words <= 120) return { label: "Length", status: "green", message: `${words} words — ideal length`, score: 100 };
  if (words <= 150) return { label: "Length", status: "yellow", message: `${words} words — a bit long, trim if possible`, score: 60 };
  return { label: "Length", status: "red", message: `${words} words — too long for cold email`, score: 20 };
}

function computeReadability(body: string): CheckResult {
  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = body.trim().split(/\s+/).filter(Boolean);
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = Math.max(words.length, 1);
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;
  const rounded = Math.max(1, Math.round(grade));

  if (rounded <= 8) return { label: "Readability", status: "green", message: `Grade ${rounded} — easy to read`, score: 100 };
  if (rounded <= 12) return { label: "Readability", status: "yellow", message: `Grade ${rounded} — consider simplifying`, score: 60 };
  return { label: "Readability", status: "red", message: `Grade ${rounded} — too complex for cold email`, score: 20 };
}

function computeCTACheck(body: string): CheckResult {
  const lower = body.toLowerCase();
  let ctaCount = 0;
  if (body.includes("?")) ctaCount++;
  for (const phrase of ACTION_PHRASES) {
    if (lower.includes(phrase)) { ctaCount++; break; }
  }

  if (ctaCount === 0) return { label: "CTA", status: "red", message: "No clear ask — add a CTA", score: 20 };
  if (ctaCount === 1) return { label: "CTA", status: "green", message: "Clear single CTA detected", score: 100 };
  return { label: "CTA", status: "yellow", message: "Multiple asks may dilute focus", score: 60 };
}

function computePersonalization(body: string): CheckResult {
  const matches = body.match(/\{\{?\w+\}?\}/g) || [];
  const unique = new Set(matches.map((m) => m.replace(/[{}]/g, "").toLowerCase()));
  const count = unique.size;

  if (count === 0) return { label: "Personalization", status: "red", message: "Not personalized — add variables", score: 20 };
  if (count <= 2) return { label: "Personalization", status: "yellow", message: `${count} variable${count > 1 ? "s" : ""} — basic personalization`, score: 60 };
  return { label: "Personalization", status: "green", message: `${count} variables — well personalized`, score: 100 };
}

const StatusIcon = ({ status }: { status: "green" | "yellow" | "red" }) => {
  if (status === "green") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (status === "yellow") return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
  return <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />;
};

export const EmailQualityChecker = ({ subject, body }: EmailQualityCheckerProps) => {
  const checks = useMemo(() => {
    const text = body.replace(/<[^>]*>/g, ""); // strip HTML
    return [
      computeSpamScore(subject, text),
      computeLengthCheck(text),
      computeReadability(text),
      computeCTACheck(text),
      computePersonalization(text),
    ];
  }, [subject, body]);

  const overallScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);
  const overallStatus = overallScore >= 70 ? "green" : overallScore >= 45 ? "yellow" : "red";

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <StatusIcon status={overallStatus} />
          Email Quality Check
          <span className="ml-auto text-xs font-normal text-muted-foreground">{overallScore}/100</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {checks.map((check) => (
          <div key={check.label} className="flex items-start gap-2">
            <StatusIcon status={check.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{check.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{check.message}</p>
            </div>
          </div>
        ))}

        <Progress
          value={overallScore}
          className="h-1.5 mt-2"
        />

        {overallStatus === "red" && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              This email may underperform. Consider editing before sending.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
