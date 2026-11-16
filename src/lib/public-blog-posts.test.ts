import { describe, expect, it } from "vitest";
import { mergePublicPosts, publicBlogPosts } from "@/data/public-blog-posts";
import { APOLLO_GUIDE_SLUG, searchGuides } from "@/data/search-guides";

describe("public article selection", () => {
  it("keeps a curated revision when a database row has the same slug", () => {
    const revised = searchGuides[0];
    const older = { ...revised, content: "Old database article", title: "Old title" };
    expect(mergePublicPosts([revised], [older])).toEqual([revised]);
  });
  it("never includes an empty article in body prerender coverage", () => {
    expect(mergePublicPosts([{ ...searchGuides[0], content: " " }])).toEqual([]);
    expect(publicBlogPosts.every((post) => post.content.trim().length > 0)).toBe(true);
  });
  it("deduplicates the existing Apollo URL instead of creating a competing article", () => {
    expect(publicBlogPosts.filter((post) => post.slug === APOLLO_GUIDE_SLUG)).toHaveLength(1);
    expect(new Set(publicBlogPosts.map((post) => post.slug)).size).toBe(publicBlogPosts.length);
  });
});