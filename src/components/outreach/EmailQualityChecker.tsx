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
  score: number;
}

const SPAM_TRIGGER_WORDS = [
  "free", "guarantee", "winner", "congratulations", "act now", "limited time",
  "click here", "earn money", "make money", "risk free", "special promotion",
];

const GENERIC_OPENERS = [
  "i hope this finds you well",
  "i wanted to reach out",
  "just reaching out",
  "touching base",
  "circling back",
  "just following up",
  "bumping this to the top",
  "i noticed that",
  "i came across",
  "i was impressed by",
  "i saw on linkedin",
];

const WEAK_CTAS = [
  "can i get 15 minutes",
  "do you have 15 minutes",
  "let's connect",
  "book a call",
  "schedule a call",
  "schedule a demo",
];

const LOW_FRICTION_CTAS = [
  "worth a look",
  "open to seeing it",
  "worth comparing",
  "should i send",
  "worth a quick look",
  "open to a quick look",
  "worth exploring",
  "worth discussing",
  "open to it",
  "worth it",
];

const PLACEHOLDER_REGEX = /\[(?:name|company|first\s*name|full\s*name)\]|\{\{\s*(?:name|company|first\s*name|full\s*name)\s*\}\}|\{(?:name|company|first\s*name|full\s*name)\}|<(?:name|company|first\s*name|full\s*name)>/gi;
const PERCENT_REGEX = /\b\d+(?:\.\d+)?%\b/g;

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
  let hits = 0;
  for (const word of SPAM_TRIGGER_WORDS) {
    if (text.includes(word)) hits++;
  }

  if (hits === 0) return { label: "Spam Risk", status: "green", message: "No obvious spam-trigger wording detected", score: 100 };
  if (hits <= 2) return { label: "Spam Risk", status: "yellow", message: `${hits} risky phrase${hits > 1 ? "s" : ""} detected`, score: 60 };
  return { label: "Spam Risk", status: "red", message: `${hits} spam-trigger phrases detected`, score: 20 };
}

function computeLengthCheck(body: string): CheckResult {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return { label: "Length", status: "red", message: "No body detected", score: 0 };
  if (words <= 25) return { label: "Length", status: "yellow", message: `${words} words — may be too thin to land`, score: 55 };
  if (words <= 90) return { label: "Length", status: "green", message: `${words} words — strong cold-email range`, score: 100 };
  if (words <= 130) return { label: "Length", status: "yellow", message: `${words} words — getting long`, score: 60 };
  return { label: "Length", status: "red", message: `${words} words — too long for cold outbound`, score: 20 };
}

function computeReadability(body: string): CheckResult {
  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = body.trim().split(/\s+/).filter(Boolean);
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = Math.max(words.length, 1);
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;
  const rounded = Math.max(1, Math.round(grade));

  if (rounded <= 8) return { label: "Readability", status: "green", message: `Grade ${rounded} — easy to scan`, score: 100 };
  if (rounded <= 11) return { label: "Readability", status: "yellow", message: `Grade ${rounded} — could be simpler`, score: 65 };
  return { label: "Readability", status: "red", message: `Grade ${rounded} — too dense for outbound`, score: 20 };
}

function computeCTAQuality(body: string): CheckResult {
  const lower = body.toLowerCase();
  const questionCount = (body.match(/\?/g) || []).length;
  const weak = WEAK_CTAS.find((phrase) => lower.includes(phrase));
  const strong = LOW_FRICTION_CTAS.find((phrase) => lower.includes(phrase));

  if (!questionCount && !weak && !strong) {
    return { label: "CTA", status: "red", message: "No clear ask detected", score: 20 };
  }
  if (questionCount > 1) {
    return { label: "CTA", status: "yellow", message: "Multiple questions can dilute the ask", score: 60 };
  }
  if (strong) {
    return { label: "CTA", status: "green", message: "Low-friction CTA detected", score: 100 };
  }
  if (weak) {
    return { label: "CTA", status: "yellow", message: "CTA works, but feels heavier than needed", score: 65 };
  }
  return { label: "CTA", status: "green", message: "Single clear ask detected", score: 90 };
}

function computePersonalization(body: string): CheckResult {
  const lower = body.toLowerCase();
  const placeholderMatches = body.match(PLACEHOLDER_REGEX) || [];

  if (placeholderMatches.length > 0) {
    return { label: "Personalization", status: "red", message: "Placeholder tokens still present", score: 0 };
  }

  const weakSignals = ["your company", "your team", "your business", "someone like you"];
  const weakHit = weakSignals.find((phrase) => lower.includes(phrase));

  if (weakHit) {
    return { label: "Personalization", status: "yellow", message: "Personalization feels generic", score: 55 };
  }

  return { label: "Personalization", status: "green", message: "No unresolved placeholders detected", score: 90 };
}

function computeCredibility(body: string): CheckResult {
  const lower = body.toLowerCase();
  const percentHits = body.match(PERCENT_REGEX) || [];
  const genericClaimPhrases = [
    "reply rates",
    "conversion rate",
    "pipeline by",
    "cut ramp time",
    "3x",
    "4x",
    "5x",
    "faster",
    "increased pipeline",
    "case study",
    "benchmark report",
  ].filter((phrase) => lower.includes(phrase));

  if (percentHits.length > 0) {
    return { label: "Credibility", status: "red", message: "Contains percentage claims — verify proof is real", score: 20 };
  }
  if (genericClaimPhrases.length >= 2) {
    return { label: "Credibility", status: "yellow", message: "Claim-heavy language may feel unearned", score: 60 };
  }
  return { label: "Credibility", status: "green", message: "Claims look restrained", score: 100 };
}

function computeNaturalness(body: string): CheckResult {
  const lower = body.toLowerCase();
  const generic = GENERIC_OPENERS.find((phrase) => lower.includes(phrase));
  if (generic) {
    return { label: "Naturalness", status: "red", message: `Generic opener detected: \"${generic}\"`, score: 20 };
  }

  const exclamations = (body.match(/!/g) || []).length;
  if (exclamations > 1) {
    return { label: "Naturalness", status: "yellow", message: "Too much excitement for cold outbound", score: 60 };
  }

  return { label: "Naturalness", status: "green", message: "Reads like a human seller wrote it", score: 100 };
}

const StatusIcon = ({ status }: { status: "green" | "yellow" | "red" }) => {
  if (status === "green") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (status === "yellow") return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
  return <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />;
};

export const scoreEmailQuality = (subject: string, body: string) => {
  const text = body.replace(/<[^>]*>/g, "").trim();
  const checks = [
    computeSpamScore(subject, text),
    computeLengthCheck(text),
    computeReadability(text),
    computeCTAQuality(text),
    computePersonalization(text),
    computeCredibility(text),
    computeNaturalness(text),
  ];

  const overallScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);
  const overallStatus = overallScore >= 75 ? "green" : overallScore >= 50 ? "yellow" : "red";
  return { checks, overallScore, overallStatus };
};

export const EmailQualityChecker = ({ subject, body }: EmailQualityCheckerProps) => {
  const { checks, overallScore, overallStatus } = useMemo(() => scoreEmailQuality(subject, body), [subject, body]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <StatusIcon status={overallStatus} />
          Outbound Quality Check
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

        <Progress value={overallScore} className="h-1.5 mt-2" />

        {overallStatus === "red" && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              This draft is likely to underperform. Tighten it before sending.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
