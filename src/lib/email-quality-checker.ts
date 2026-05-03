import { OUTBOUND_KB, EmailTemplateType } from './outbound-kb';

export interface QualityCheckInput {
  subject: string;
  body: string;
  templateType: EmailTemplateType;
}

export interface QualityCheckResult {
  passed: boolean;
  score: number;              // 0–100
  criticalFailures: string[];
  warnings: string[];
  suggestions: string[];
  wordCount: number;
  wordCountLimit: number;
  deadPhrasesFound: string[];
  subjectIssues: string[];
}

const WORD_LIMIT_MAP: Record<EmailTemplateType, number> = {
  cold_introduction:              OUTBOUND_KB.emailLimits.coldIntroMaxWords,
  follow_up:                      OUTBOUND_KB.emailLimits.followUpMaxWords,
  meeting_request:                OUTBOUND_KB.emailLimits.meetingRequestMaxWords,
  demo_invite:                    OUTBOUND_KB.emailLimits.demoInviteMaxWords,
  proposal:                       OUTBOUND_KB.emailLimits.proposalMaxWords,
  framework_4ts:                  OUTBOUND_KB.emailLimits.framework4tsMaxWords,
  framework_elusive:              OUTBOUND_KB.emailLimits.frameworkElusiveMaxWords,
  framework_proximity:            OUTBOUND_KB.emailLimits.frameworkProximityMaxWords,
  framework_4ps_followup:         OUTBOUND_KB.emailLimits.framework4psMaxWords,
  framework_4ps_elusive_followup: OUTBOUND_KB.emailLimits.framework4psElusiveMaxWords,
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function hasHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function hasLinks(text: string): number {
  return (text.match(/https?:\/\/\S+/g) || []).length;
}

function findDeadPhrases(bodyLower: string): string[] {
  return OUTBOUND_KB.deadPhrases.filter(p => bodyLower.includes(p));
}

function findSubjectIssues(subjectLower: string): string[] {
  const issues: string[] = [];
  const words = subjectLower.trim().split(/\s+/).filter(Boolean);
  if (words.length > OUTBOUND_KB.emailLimits.subjectLineMaxWords) {
    issues.push(`Subject is ${words.length} words — max is ${OUTBOUND_KB.emailLimits.subjectLineMaxWords}`);
  }
  if (subjectLower.length > OUTBOUND_KB.emailLimits.subjectLineMaxChars) {
    issues.push(`Subject is ${subjectLower.length} chars — max is ${OUTBOUND_KB.emailLimits.subjectLineMaxChars}`);
  }
  for (const dead of OUTBOUND_KB.deadSubjectPhrases) {
    if (subjectLower.startsWith(dead) || subjectLower.includes(dead)) {
      issues.push(`Subject contains banned phrase: "${dead}"`);
    }
  }
  if (/[A-Z]{3,}/.test(subjectLower)) {
    issues.push('Subject contains ALL CAPS — avoid');
  }
  return issues;
}

export function checkEmailQuality(input: QualityCheckInput): QualityCheckResult {
  const { subject, body, templateType } = input;
  const bodyLower = body.toLowerCase();
  const subjectLower = subject.toLowerCase();

  const wordCountLimit = WORD_LIMIT_MAP[templateType] ?? OUTBOUND_KB.emailLimits.coldIntroMaxWords;
  const wordCount = countWords(body);
  const questionCount = countQuestions(body);
  const linkCount = hasLinks(body);
  const bodyHasHtml = hasHtml(body);
  const deadPhrasesFound = findDeadPhrases(bodyLower);
  const subjectIssues = findSubjectIssues(subjectLower);

  const criticalFailures: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // ─── Critical checks ───────────────────────────────────────────────
  if (wordCount > wordCountLimit) {
    criticalFailures.push(`Email is ${wordCount} words — limit for ${templateType.replace('_', ' ')} is ${wordCountLimit}`);
  }

  if (deadPhrasesFound.length > 0) {
    criticalFailures.push(`Dead phrases detected: "${deadPhrasesFound[0]}"${deadPhrasesFound.length > 1 ? ` (+${deadPhrasesFound.length - 1} more)` : ''}`);
  }

  if (questionCount > OUTBOUND_KB.emailLimits.maxCtasPerEmail) {
    criticalFailures.push(`${questionCount} questions found — use exactly 1 CTA`);
  }

  if (questionCount === 0 && wordCount > 10) {
    criticalFailures.push('No CTA detected — end with a single soft question');
  }

  if (subjectIssues.length > 0) {
    // First subject issue is critical, rest are warnings
    criticalFailures.push(subjectIssues[0]);
    subjectIssues.slice(1).forEach(i => warnings.push(i));
  }

  // ─── Warnings ──────────────────────────────────────────────────────
  if (bodyHasHtml) {
    warnings.push('HTML detected — plain text performs better on first touch');
  }

  if (linkCount > 1) {
    warnings.push(`${linkCount} links in email — max 1 recommended; zero on first touch`);
  }

  if (wordCount < OUTBOUND_KB.emailLimits.coldIntroMinWords) {
    warnings.push(`Email may be too short (${wordCount} words)`);
  }

  // ─── Suggestions ───────────────────────────────────────────────────
  if (!bodyLower.match(/\b(you|your|they|their)\b/)) {
    suggestions.push('Open with something about the recipient, not about yourself');
  }

  if (bodyLower.match(/\bfeatures?\b|\bplatform\b|\bsolution\b|\bproduct\b/)) {
    suggestions.push('Lead with the outcome or pain, not the product');
  }

  if (templateType === 'cold_introduction' && linkCount > 0) {
    suggestions.push('Consider removing all links on first touch — zero links often increase reply rates');
  }

  // ─── Score ─────────────────────────────────────────────────────────
  // Start at 100, deduct for failures
  let score = 100;
  score -= criticalFailures.length * 20;
  score -= warnings.length * 8;
  score -= suggestions.length * 3;
  score = Math.max(0, Math.min(100, score));

  const passed = criticalFailures.length === 0 && score >= 60;

  return {
    passed,
    score,
    criticalFailures,
    warnings,
    suggestions,
    wordCount,
    wordCountLimit,
    deadPhrasesFound,
    subjectIssues,
  };
}
