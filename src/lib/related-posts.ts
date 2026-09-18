import { blogPostsMeta, type BlogPostMeta } from "@/data/blog-index";

/**
 * Near-duplicate categories, merged for the purpose of finding neighbours.
 *
 * Sixteen posts were spread across ten categories, two pairs of which were the
 * same topic under different names. That is not a taxonomy, it is a list — and
 * a cluster of one links to nothing. Merged here rather than rewritten in the
 * data, so the label each post displays is left exactly as its author wrote it
 * and a regenerated blog index cannot silently undo this.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  "Tool Comparisons": "Comparisons",
  "Outbound Sales": "Outbound",
};

const clusterOf = (post: BlogPostMeta): string =>
  CATEGORY_ALIASES[post.category] ?? post.category;

/**
 * The significant words in a keyword phrase.
 *
 * Stop words would make every post a neighbour of every other: "for", "to" and
 * "the" appear in most of them and mean nothing about the subject.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "b2b", "be", "best", "by", "for", "from",
  "guide", "how", "in", "is", "it", "of", "on", "or", "the", "to", "tools",
  "what", "with", "your",
]);

const tokens = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

/**
 * Posts worth reading next, best first.
 *
 * Every article was a dead end. The only link on a post was "All articles"
 * back to the index, so a reader who finished one had nowhere to go and a
 * crawler following one in found a leaf: no path between related pages, and
 * none of the authority that flows along such a path. Sixteen articles were
 * sixteen islands.
 *
 * Ranked by how much two posts actually share, not by recency:
 *
 *  - same cluster and overlapping keywords is the strongest signal
 *  - keyword overlap alone comes next, because the categories are coarse and
 *    a post can be a genuine neighbour from a different one
 *  - same cluster alone is the weakest, and still better than a stranger
 *
 * Ties break on the newer post, so a cluster does not keep pointing at its
 * oldest member forever.
 */
export function relatedPosts(slug: string, limit = 3): BlogPostMeta[] {
  const post = blogPostsMeta.find((p) => p.slug === slug);
  if (!post) return [];

  const cluster = clusterOf(post);
  const phrases = new Set(post.keywords.map((k) => k.toLowerCase()));
  const words = new Set(post.keywords.flatMap((k) => tokens(k)));

  const scored = blogPostsMeta
    .filter((candidate) => candidate.slug !== slug)
    .map((candidate) => {
      const samePhrase = candidate.keywords.filter((k) => phrases.has(k.toLowerCase())).length;
      const sameWord = new Set(
        candidate.keywords.flatMap((k) => tokens(k)).filter((w) => words.has(w)),
      ).size;
      const sameCluster = clusterOf(candidate) === cluster ? 1 : 0;
      // A whole shared phrase is the strongest signal, a shared significant
      // word the weakest. Word overlap is what connects "lead scoring" to "ICP
      // scoring" — the same subject written two ways, which exact phrase
      // matching leaves as strangers.
      return { candidate, score: samePhrase * 3 + sameWord + sameCluster };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.publishedAt.localeCompare(a.candidate.publishedAt),
    )
    .map(({ candidate }) => candidate);

  /**
   * Nothing may be a dead end.
   *
   * One post scored against nothing at all: a lone category and no shared
   * vocabulary. Rendering an empty "keep reading" for it would leave the exact
   * problem this set out to fix, so a post short of neighbours is topped up
   * with the newest articles it is not already pointing at. A weaker link is
   * still a way out.
   */
  const padded = [...scored];
  if (padded.length < limit) {
    const have = new Set([slug, ...padded.map((p) => p.slug)]);
    const recent = [...blogPostsMeta]
      .filter((p) => !have.has(p.slug))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    padded.push(...recent.slice(0, limit - padded.length));
  }

  return padded.slice(0, limit);
}
