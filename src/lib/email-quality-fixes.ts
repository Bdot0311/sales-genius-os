const SPAM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bfree\b/gi, "included"],
  [/\bguarantee(?:d)?\b/gi, "aim"],
  [/\bwinner\b/gi, "recipient"],
  [/\bcongratulations\b/gi, "good news"],
  [/\bact now\b/gi, "when useful"],
  [/\blimited time\b/gi, "currently available"],
  [/\bclick here\b/gi, "see details"],
  [/\b(?:earn|make) money\b/gi, "increase revenue"],
  [/\brisk[ -]?free\b/gi, "low commitment"],
  [/\bspecial promotion\b/gi, "current offer"],
];

const BANNED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bi hope this finds you well[,.]?\s*/gi, ""],
  [/\bjust checking in[,.]?\s*/gi, "Following up, "],
  [/\breaching out because\b/gi, "Writing because"],
  [/\bleverage\b/gi, "use"],
  [/\boptimi[sz]e\b/gi, "improve"],
  [/\bstreamline\b/gi, "simplify"],
  [/\bsynergy\b/gi, "fit"],
  [/\brevolutionary\b/gi, "practical"],
  [/\bcutting-edge\b/gi, "modern"],
  [/\bindustry-leading\b/gi, "established"],
  [/\bbest-in-class\b/gi, "reliable"],
];

const SIGN_OFF = /^(best|regards|thanks|thank you|sincerely|cheers|warmly|all the best)[\s,!.:-]*$/i;

function linesOf(body: string) {
  return body.split("\n").map((line) => line.trim()).filter(Boolean);
}

function singleCta(body: string) {
  const lines = linesOf(body);
  if (lines.length === 0) return body;
  const cleaned = lines
    .map((line) => line.replace(/\?\s*/g, ". ").replace(/\.\s*\./g, ".").trim());
  const signOffIndex = cleaned.findIndex((line, index) => index > 0 && (SIGN_OFF.test(line) || (index === cleaned.length - 1 && line.split(/\s+/).length <= 3)));
  const insertAt = signOffIndex >= 0 ? signOffIndex : cleaned.length;
  cleaned.splice(insertAt, 0, "Worth a quick look?");
  return cleaned.join("\n\n");
}

function moveCtaToEnd(body: string) {
  return singleCta(body);
}

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * Trim a body to a word budget while preserving paragraph breaks, the final
 * CTA line and the sign-off block. Content is dropped sentence-by-sentence
 * from the middle paragraphs, never by flattening the whole email.
 */
function trimToWords(body: string, limit: number) {
  const lines = linesOf(body);
  if (lines.length === 0) return body.trim();
  if (countWords(body) <= limit) return body.trim();

  // Detect a trailing sign-off block ("Best,\nSam") and keep it intact.
  let signOffStart = -1;
  for (let i = Math.max(1, lines.length - 3); i < lines.length; i++) {
    if (SIGN_OFF.test(lines[i])) { signOffStart = i; break; }
  }
  const signOff = signOffStart >= 0 ? lines.slice(signOffStart) : [];
  const content = signOffStart >= 0 ? lines.slice(0, signOffStart) : [...lines];
  if (content.length === 0) return lines.join("\n\n");

  // Always keep the closing CTA line (last content line).
  const cta = content.pop() as string;
  const reserved = countWords(cta) + signOff.reduce((sum, l) => sum + countWords(l), 0);
  let budget = Math.max(0, limit - reserved);

  const kept: string[] = [];
  for (const line of content) {
    if (budget <= 0) break;
    if (countWords(line) <= budget) {
      kept.push(line);
      budget -= countWords(line);
      continue;
    }
    // Keep as many whole sentences of this paragraph as fit.
    const sentences = line.match(/[^.!?]+[.!?]*/g) ?? [line];
    const partial: string[] = [];
    for (const sentence of sentences) {
      const words = countWords(sentence);
      if (words > budget) break;
      partial.push(sentence.trim());
      budget -= words;
    }
    if (partial.length) {
      let text = partial.join(" ").trim();
      if (!/[.!?]$/.test(text)) text = `${text.replace(/[,;:]$/, "")}.`;
      kept.push(text);
    }
    break;
  }

  if (kept.length === 0) kept.push(content[0]);
  return [...kept, cta, ...signOff].join("\n\n");
}


function simplify(body: string) {
  return body
    .replace(/\butilize\b/gi, "use")
    .replace(/\bfacilitate\b/gi, "help")
    .replace(/\bimplementation\b/gi, "setup")
    .replace(/\bapproximately\b/gi, "about")
    .replace(/\bin order to\b/gi, "to")
    .replace(/;\s+/g, ". ");
}

export function applyEmailQualityFix(body: string, label: string): string {
  let fixed = body.trim();
  switch (label) {
    case "Spam Risk":
      SPAM_REPLACEMENTS.forEach(([pattern, replacement]) => { fixed = fixed.replace(pattern, replacement); });
      break;
    case "Banned Phrases":
      BANNED_REPLACEMENTS.forEach(([pattern, replacement]) => { fixed = fixed.replace(pattern, replacement); });
      break;
    case "CTA":
    case "CTA Question":
      fixed = singleCta(fixed);
      break;
    case "CTA position":
      fixed = moveCtaToEnd(fixed);
      break;
    case "Links":
      fixed = fixed.replace(/<a\b[^>]*>(.*?)<\/a>/gis, "$1").replace(/https?:\/\/[^\s<]+/gi, "");
      break;
    case "Images":
      fixed = fixed.replace(/<img\b[^>]*>/gi, "");
      break;
    case "Signature":
      fixed = fixed.replace(/<img\b[^>]*>/gi, "").replace(/<[^>]+>/g, "");
      break;
    case "Credibility":
      fixed = fixed
        .replace(/\b\d+(?:\.\d+)?%\b/g, "measurably")
        .replace(/\b[3-9]x\b/gi, "noticeably")
        .replace(/\b(?:increased pipeline|cut ramp time)\b/gi, "improved results");
      break;
    case "Naturalness":
      BANNED_REPLACEMENTS.forEach(([pattern, replacement]) => { fixed = fixed.replace(pattern, replacement); });
      fixed = fixed.replace(/\b(?:I noticed|I wanted to reach out|I came across)\b[,.]?\s*/i, "");
      break;
    case "You-focus":
      fixed = fixed
        .replace(/(^|[.!?]\s+|\n+)I help\s+/gi, "$1Your team can ")
        .replace(/(^|[.!?]\s+|\n+)We help\s+/gi, "$1Your team can ")
        .replace(/(^|[.!?]\s+|\n+)Our platform\s+/gi, "$1Your workflow ");
      break;
    case "Readability":
      fixed = simplify(fixed);
      break;
    case "Length":
    case "Word Ceiling":
      fixed = trimToWords(fixed, 70);
      break;
    default:
      break;
  }
  return fixed.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
}