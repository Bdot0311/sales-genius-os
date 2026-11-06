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
