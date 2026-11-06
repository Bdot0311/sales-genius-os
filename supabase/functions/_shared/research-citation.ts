import { contentWords } from "./grounding.ts";

/**
 * Whether a model-written observation cites a page this run actually fetched.
 *
 * The brief stores observations as facts and every later email treats them
 * as such. The model is asked to cite the page the fact came from. A citation
 * that is not one of the URLs fetched in this run is not a citation — it is
 * a provenance the model invented, and the fact attached to it cannot be
 * told apart from one that was read. Those observations are dropped.
 *
 * This does not prove the fact occurs on the page. It only refuses facts
 * whose claimed source was never retrieved. Signal events carry their own
 * provider provenance and are not passed through here.
 */

function normalizeSource(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[),.;]+$/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** The URL a citation is making, or the raw text when it names a host directly. */
function citationTarget(source: string): string {
  const match = String(source ?? "").match(/https?:\/\/[^\s)]+/i);
  return normalizeSource(match ? match[0] : String(source ?? ""));
}

export function sourceWasFetched(source: string, fetched: string[]): boolean {
  const cited = citationTarget(source);
  // A citation with no host is not a page. "the about page" is not evidence.
  if (!cited.includes(".")) return false;
  const citedHost = cited.split("/")[0];
  const citedPath = cited.slice(citedHost.length);

  return fetched.some((url) => {
    const page = normalizeSource(url);
    if (!page.includes(".")) return false;
    const pageHost = page.split("/")[0];
    if (pageHost !== citedHost) return false;
    const pagePath = page.slice(pageHost.length);
    if (!citedPath || citedPath === "/") return true;
    return pagePath === citedPath || pagePath.startsWith(`${citedPath}/`) || citedPath.startsWith(`${pagePath}/`);
  });
}

/**
 * Whether the content words of a model sentence appear in text this run read.
 *
 * A matching source URL is not enough: the model can cite a page it saw and
 * then state something that page does not say. This requires the claim's own
 * words to be in the corpus. It is not a proof of meaning. A sentence that
 * uses only words from the page can still be false, and a true paraphrase
 * that shares none of those words is dropped. Short claims have to match in
 * full. Longer ones have to match at least 70 percent, and at least three
 * words, so a single borrowed noun cannot carry an invented sentence.
 */
export function claimSupportedByCorpus(claim: string, corpus: string): boolean {
  const words = [...new Set(contentWords(claim))];
  if (words.length === 0) return false;
  const haystack = new Set(contentWords(corpus));
  const hit = words.filter((word) => haystack.has(word)).length;
  if (words.length <= 4) return hit === words.length;
  return hit / words.length >= 0.7 && hit >= 3;
}
