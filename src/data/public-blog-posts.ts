import { blogDbSnapshot } from "./blog-db-snapshot";
import { blogPosts } from "./blog-posts";
import { searchGuides } from "./search-guides";
import type { BlogPost } from "./blog-posts";

export function mergePublicPosts(...sources: BlogPost[][]): BlogPost[] {
  const bySlug = new Map<string, BlogPost>();
  for (const posts of sources) {
    for (const post of posts) {
      if (!bySlug.has(post.slug) && post.content.trim()) bySlug.set(post.slug, post);
    }
  }
  return [...bySlug.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Public editorial content only; never serialize authenticated account data. */
export const publicBlogPosts = mergePublicPosts(searchGuides, blogDbSnapshot, blogPosts);