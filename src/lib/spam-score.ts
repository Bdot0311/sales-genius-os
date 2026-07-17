/**
 * Deliverability spam-risk engine.
 *
 * Deterministic, client-side analysis of an email's subject + body for the
 * signals that push mail into spam/promotions: trigger words, link density,
 * image-to-text ratio, link shorteners, shouting, and HTML that isn't
 * plain-text friendly. This is about INBOX PLACEMENT, not reply-rate copy
 * quality (that lives in EmailQualityChecker). No network, no fabricated data —
 * every deduction maps to a concrete, visible reason.
 *
 * Scores start at 100 and lose points per issue. The result updates live as
 * copy changes.
 */

export type SpamSeverity = "low" | "medium" | "high";

export interface SpamIssue {
  id: string;
  label: string;
  severity: SpamSeverity;
  /** What was found. */
  message: string;
  /** Concrete fix the user can act on. */
  fix: string;
  /** Points removed from the 100-point score. */
  penalty: number;
}

export interface SpamScoreResult {
  /** 0–100; higher = safer for inbox placement. */
  score: number;
  rating: "excellent" | "good" | "risky" | "high-risk";
  issues: SpamIssue[];
  stats: {
    words: number;
    links: number;
    images: number;
    linkDensity: number; // links per 100 words
    capsRatio: number; // 0–1 across letters
    exclamations: number;
  };
}

/**
 * Deliverability-oriented trigger words/phrases. Weighted: some are far more
 * damaging than others. Kept honest and non-exhaustive; these are the phrases
 * spam filters most reliably penalize in cold B2B mail.
 */
const TRIGGER_WORDS: { phrase: string; weight: number }[] = [
  { phrase: "free", weight: 2 },
  { phrase: "100%", weight: 3 },
  { phrase: "guarantee", weight: 3 },
  { phrase: "guaranteed", weight: 3 },
  { phrase: "no obligation", weight: 3 },
  { phrase: "risk free", weight: 3 },
  { phrase: "risk-free", weight: 3 },
  { phrase: "act now", weight: 4 },
  { phrase: "limited time", weight: 3 },
  { phrase: "urgent", weight: 3 },
  { phrase: "winner", weight: 4 },
  { phrase: "congratulations", weight: 3 },
  { phrase: "click here", weight: 3 },
  { phrase: "buy now", weight: 3 },
  { phrase: "order now", weight: 3 },
  { phrase: "cash", weight: 2 },
  { phrase: "earn money", weight: 4 },
  { phrase: "make money", weight: 4 },
  { phrase: "double your", weight: 4 },
  { phrase: "extra income", weight: 4 },
  { phrase: "special promotion", weight: 3 },
  { phrase: "discount", weight: 2 },
  { phrase: "cheap", weight: 2 },
  { phrase: "credit card", weight: 3 },
  { phrase: "this isn't spam", weight: 5 },
  { phrase: "not spam", weight: 5 },
  { phrase: "dear friend", weight: 4 },
  { phrase: "million dollars", weight: 4 },
  { phrase: "increase sales", weight: 2 },
  { phrase: "unsubscribe below to", weight: 2 },
];

const LINK_SHORTENERS = [
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "buff.ly",
  "is.gd", "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "tiny.cc",
];

const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi;
const HREF_REGEX = /href\s*=\s*["']([^"']+)["']/gi;
const IMG_REGEX = /<img\b[^>]*>/gi;
const TAG_REGEX = /<[^>]+>/g;

function collectLinks(body: string): string[] {
  const links: string[] = [];
  const plainMatches = body.match(URL_REGEX) || [];
  links.push(...plainMatches);
  let m: RegExpExecArray | null;
  const hrefRe = new RegExp(HREF_REGEX);
  while ((m = hrefRe.exec(body)) !== null) {
    links.push(m[1]);
  }
  return links;
}

function stripHtml(body: string): string {
  return body.replace(TAG_REGEX, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Analyze an email for spam/placement risk. Pure and synchronous.
 */
export function analyzeSpamRisk(subject: string, body: string): SpamScoreResult {
  const issues: SpamIssue[] = [];
  const text = stripHtml(body);
  const combined = `${subject} ${text}`;
  const lower = combined.toLowerCase();

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // ---- Trigger words ----
  const foundTriggers: string[] = [];
  let triggerPenalty = 0;
  for (const { phrase, weight } of TRIGGER_WORDS) {
    if (lower.includes(phrase)) {
      foundTriggers.push(phrase);
      triggerPenalty += weight;
    }
  }
  if (foundTriggers.length > 0) {
    triggerPenalty = Math.min(triggerPenalty, 35);
    issues.push({
      id: "trigger-words",
      label: "Spam trigger words",
      severity: triggerPenalty >= 12 ? "high" : triggerPenalty >= 6 ? "medium" : "low",
      message: `${foundTriggers.length} flagged phrase${foundTriggers.length > 1 ? "s" : ""}: ${foundTriggers.slice(0, 5).map((p) => `"${p}"`).join(", ")}${foundTriggers.length > 5 ? "…" : ""}`,
      fix: "Rewrite these in plain, specific language. Salesy superlatives are the strongest spam signal in cold mail.",
      penalty: triggerPenalty,
    });
  }

  // ---- Links ----
  const links = collectLinks(body);
  const linkCount = links.length;
  const linkDensity = wordCount > 0 ? (linkCount / wordCount) * 100 : linkCount > 0 ? 100 : 0;

  if (linkCount >= 3) {
    issues.push({
      id: "link-count",
      label: "Too many links",
      severity: "high",
      message: `${linkCount} links detected. Cold email with 3+ links is a strong spam signal.`,
      fix: "Cut to a single link, ideally none on a first touch. Move extras to the follow-up.",
      penalty: 20,
    });
  } else if (linkCount === 2) {
    issues.push({
      id: "link-count",
      label: "Multiple links",
      severity: "medium",
      message: "2 links detected. First-touch cold email lands better with at most one.",
      fix: "Keep one link, remove the other, or save it for a reply.",
      penalty: 10,
    });
  } else if (linkCount === 1) {
    issues.push({
      id: "link-count",
      label: "Contains a link",
      severity: "low",
      message: "1 link detected. Usually fine, but a truly link-free first touch places best.",
      fix: "Consider asking permission to send the link instead of including it up front.",
      penalty: 4,
    });
  }

  // Link shorteners
  const shorteners = links.filter((l) => LINK_SHORTENERS.some((s) => l.toLowerCase().includes(s)));
  if (shorteners.length > 0) {
    issues.push({
      id: "link-shortener",
      label: "Link shortener",
      severity: "high",
      message: `Shortened URL${shorteners.length > 1 ? "s" : ""} detected (${[...new Set(shorteners.map((s) => {
        try { return new URL(s).hostname; } catch { return s; }
      }))].join(", ")}). Filters distrust cloaked links.`,
      fix: "Use the full destination URL on your own domain, not a public shortener.",
      penalty: 15,
    });
  }

  // ---- Images / image-to-text ratio ----
  const imgCount = (body.match(IMG_REGEX) || []).length;
  if (imgCount > 0 && wordCount < 20) {
    issues.push({
      id: "image-heavy",
      label: "Image-heavy, little text",
      severity: "high",
      message: `${imgCount} image(s) with only ${wordCount} words. Image-dominant email is classic promotions/spam shaping.`,
      fix: "Lead with real text. Keep images out of the first touch entirely.",
      penalty: 18,
    });
  } else if (imgCount >= 2) {
    issues.push({
      id: "image-count",
      label: "Multiple images",
      severity: "medium",
      message: `${imgCount} images detected. Multiple images routinely trigger the Promotions tab.`,
      fix: "Reduce to zero or one image for cold outreach.",
      penalty: 9,
    });
  } else if (imgCount === 1) {
    issues.push({
      id: "image-count",
      label: "Contains an image",
      severity: "low",
      message: "1 image detected. A single image is tolerable but not ideal for a first touch.",
      fix: "Text-only first touches place in the primary inbox more often.",
      penalty: 4,
    });
  }

  // ---- Shouting: all-caps ratio ----
  const letters = combined.replace(/[^a-zA-Z]/g, "");
  const capsLetters = combined.replace(/[^A-Z]/g, "");
  const capsRatio = letters.length > 0 ? capsLetters.length / letters.length : 0;
  if (letters.length >= 20 && capsRatio > 0.35) {
    issues.push({
      id: "all-caps",
      label: "Excessive capitals",
      severity: capsRatio > 0.5 ? "high" : "medium",
      message: `${Math.round(capsRatio * 100)}% of letters are uppercase. Shouting is a well-known spam signal.`,
      fix: "Use normal sentence case. Reserve capitals for proper nouns.",
      penalty: capsRatio > 0.5 ? 14 : 8,
    });
  }

  // Subject in all caps
  const subjLetters = subject.replace(/[^a-zA-Z]/g, "");
  if (subjLetters.length >= 6 && subject.replace(/[^A-Z]/g, "").length / subjLetters.length > 0.7) {
    issues.push({
      id: "subject-caps",
      label: "All-caps subject",
      severity: "high",
      message: "Subject line is mostly capitals.",
      fix: "Write the subject in sentence case, like a note from a colleague.",
      penalty: 12,
    });
  }

  // ---- Excessive punctuation ----
  const exclamations = (combined.match(/!/g) || []).length;
  if (exclamations >= 3) {
    issues.push({
      id: "exclamations",
      label: "Too many exclamation marks",
      severity: "medium",
      message: `${exclamations} exclamation marks. Filters read this as hype.`,
      fix: "Keep it to zero for cold B2B outreach.",
      penalty: 9,
    });
  } else if (exclamations === 2) {
    issues.push({
      id: "exclamations",
      label: "Exclamation marks",
      severity: "low",
      message: "2 exclamation marks detected.",
      fix: "Drop them. Cold email reads more credibly without.",
      penalty: 3,
    });
  }
  if (/[!?]{2,}|\${2,}|#{2,}/.test(combined)) {
    issues.push({
      id: "punct-runs",
      label: "Repeated punctuation",
      severity: "medium",
      message: 'Repeated punctuation runs detected (e.g. "!!", "$$").',
      fix: "Remove repeated symbols. They read as spammy emphasis.",
      penalty: 7,
    });
  }

  // ---- Plain-text friendliness ----
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(body);
  if (hasHtmlTags) {
    const textLen = text.length;
    const rawLen = body.length;
    // Very tag-dense body with little readable text.
    if (textLen > 0 && rawLen / Math.max(textLen, 1) > 3) {
      issues.push({
        id: "html-heavy",
        label: "Heavy HTML markup",
        severity: "medium",
        message: "The body is mostly markup relative to readable text. Bloated HTML correlates with spam.",
        fix: "Send close to plain text. Strip templates, tracking wrappers, and nested tables.",
        penalty: 10,
      });
    }
    if (/<style|<table|<font\b|bgcolor=|<center>/i.test(body)) {
      issues.push({
        id: "legacy-html",
        label: "Legacy/newsletter HTML",
        severity: "low",
        message: "Newsletter-style HTML detected (tables, inline styles, font tags).",
        fix: "Cold outreach should look like a personal 1:1 email, not a marketing template.",
        penalty: 6,
      });
    }
  }

  // ---- Spacer / hidden-text tricks ----
  if (/style\s*=\s*["'][^"']*(?:display\s*:\s*none|font-size\s*:\s*0|color\s*:\s*#?fff)/i.test(body)) {
    issues.push({
      id: "hidden-text",
      label: "Hidden text",
      severity: "high",
      message: "Hidden or invisible text detected (display:none / zero font / white-on-white).",
      fix: "Remove hidden content entirely. It is treated as deliberate evasion.",
      penalty: 20,
    });
  }

  // ---- Empty / no-text ----
  if (wordCount === 0) {
    issues.push({
      id: "no-text",
      label: "No readable text",
      severity: "high",
      message: "No plain-text content detected.",
      fix: "Add real written content. Image-only or empty bodies are filtered aggressively.",
      penalty: 30,
    });
  } else if (wordCount < 12 && imgCount === 0) {
    issues.push({
      id: "thin-body",
      label: "Very short body",
      severity: "low",
      message: `Only ${wordCount} words. Extremely short bodies can look like a test/spam probe.`,
      fix: "A few natural sentences of context place better than one line.",
      penalty: 5,
    });
  }

  const totalPenalty = issues.reduce((sum, i) => sum + i.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  const rating: SpamScoreResult["rating"] =
    score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 45 ? "risky" : "high-risk";

  // Sort issues most-severe first for display.
  const severityRank: Record<SpamSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.penalty - a.penalty);

  return {
    score,
    rating,
    issues,
    stats: {
      words: wordCount,
      links: linkCount,
      images: imgCount,
      linkDensity: Math.round(linkDensity * 10) / 10,
      capsRatio: Math.round(capsRatio * 100) / 100,
      exclamations,
    },
  };
}
