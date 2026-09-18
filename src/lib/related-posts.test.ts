import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { blogPostsMeta } from "@/data/blog-index";
import { relatedPosts } from "./related-posts";

const PAGE = readFileSync("src/pages/BlogPost.tsx", "utf8");

/**
 * Sixteen articles were sixteen islands.
 *
 * The only link on a post was "All articles" back to the index. A reader who
 * finished one had nowhere to go, and a crawler following one in found a leaf:
 * no path between related pages, so none of the authority that flows along
 * such a path. The categories made it worse — ten of them across sixteen
 * posts, two pairs being the same topic under different names, which leaves
 * most "clusters" as a cluster of one.
 */
describe("every article leads somewhere", () => {
  it("leaves no post a dead end", () => {
    for (const post of blogPostsMeta) {
      expect(relatedPosts(post.slug), post.slug).not.toHaveLength(0);
    }
  });

  it("never points a post at itself", () => {
    for (const post of blogPostsMeta) {
      const slugs = relatedPosts(post.slug).map((p) => p.slug);
      expect(slugs, post.slug).not.toContain(post.slug);
      expect(new Set(slugs).size, `${post.slug} repeats a link`).toBe(slugs.length);
    }
  });

  it("puts the strongest pairs first", () => {
    // These share a subject outright, and each is the other's best match.
    const pairs: [string, string][] = [
      ["email-warmup", "cold-email-infrastructure-guide"],
      ["cold-email-infrastructure-guide", "email-warmup"],
      ["what-is-icp-scoring", "icp-criteria-revenue-operations"],
      ["icp-criteria-revenue-operations", "what-is-icp-scoring"],
      ["best-b2b-lead-generation-tools", "apollo-vs-instantly-vs-salesloft"],
      ["apollo-vs-instantly-vs-salesloft", "best-b2b-lead-generation-tools"],
    ];
    for (const [from, to] of pairs) {
      expect(relatedPosts(from)[0]?.slug, `${from} → ${to}`).toBe(to);
    }
  });

  it("connects a post whose exact keywords match nothing", () => {
    // "lead scoring" and "ICP scoring" are the same subject written two ways.
    // Exact phrase matching left this post scoring against nothing at all —
    // no links out, none in — which is the state the whole thing exists to fix.
    const related = relatedPosts("b2b-lead-scoring-models-startups").map((p) => p.slug);
    expect(related).toContain("what-is-icp-scoring");
  });

  it("merges the categories that are the same topic twice", () => {
    const SRC = readFileSync("src/lib/related-posts.ts", "utf8");
    expect(SRC).toContain('"Tool Comparisons": "Comparisons"');
    expect(SRC).toContain('"Outbound Sales": "Outbound"');
    // Merged for matching only. The label each post displays is its author's.
    expect(SRC).toContain("CATEGORY_ALIASES[post.category] ?? post.category");
  });

  it("does not treat filler words as a shared subject", () => {
    // Without a stop list, "for", "the" and "b2b" would make every post a
    // neighbour of every other and the ranking would mean nothing.
    const SRC = readFileSync("src/lib/related-posts.ts", "utf8");
    expect(SRC).toContain("STOP_WORDS");
    expect(SRC).toContain('"b2b"');
  });

  it("returns at most what it was asked for", () => {
    expect(relatedPosts(blogPostsMeta[0].slug, 2)).toHaveLength(2);
    expect(relatedPosts(blogPostsMeta[0].slug, 5)).toHaveLength(5);
  });

  it("says nothing for a slug that is not a post", () => {
    expect(relatedPosts("no-such-post")).toEqual([]);
    expect(relatedPosts("")).toEqual([]);
  });

  it("renders the links in the page, not after a fetch", () => {
    // They come from the static index, so they are in the markup a crawler
    // reads rather than arriving once JavaScript has run.
    expect(PAGE).toContain('import { relatedPosts } from "@/lib/related-posts"');
    expect(PAGE).toContain("relatedPosts(slug ?? \"\")");
    expect(PAGE).toContain("to={`/blog/${item.slug}`}");
  });
});
