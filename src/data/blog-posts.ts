// Full posts (metadata + body). Only import this where the article body is
// needed (the build-time SEO plugin and the article page's static fallback).
// List/index surfaces should import { blogPostsMeta } from "./blog-index".
import { blogPostsMeta, type BlogPostMeta } from "./blog-index";
import { blogContent } from "./blog-content";

export type { BlogPostMeta };

export interface BlogPost extends BlogPostMeta {
  content: string;
}

export const blogPosts: BlogPost[] = blogPostsMeta.map((p) => ({
  ...p,
  content: blogContent[p.slug] ?? "",
}));
