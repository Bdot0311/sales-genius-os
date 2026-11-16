import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { blogPostsMeta as staticPosts, type BlogPostMeta } from "@/data/blog-index";
import type { BlogPost } from "@/data/blog-posts";
import { searchGuides } from "@/data/search-guides";

const editorialSlugs = new Set(searchGuides.map((post) => post.slug));
const initialPosts = [...searchGuides, ...staticPosts.filter((post) => !editorialSlugs.has(post.slug))]
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

/** Fetches DB posts, merges with static seeds, sorted newest-first, deduped by slug. */
export function useAllBlogPosts() {
  const [posts, setPosts] = useState<BlogPostMeta[]>(initialPosts);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("slug, title, description, category, keywords, reading_time, published_at")
        .order("published_at", { ascending: false });

      if (cancelled) return;
      if (error || !data) {
        setPosts(initialPosts);
        setLoading(false);
        return;
      }

      const dbPosts: BlogPostMeta[] = data.map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        category: p.category,
        keywords: (p.keywords as string[]) || [],
        readingTime: p.reading_time,
        publishedAt: (p.published_at as string).slice(0, 10),
      }));

      const eligible = dbPosts.filter((post) => !editorialSlugs.has(post.slug));
      const seen = new Set(eligible.map((p) => p.slug));
      const merged = [...eligible, ...initialPosts.filter((p) => !seen.has(p.slug))];
      merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      setPosts(merged);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { posts, loading };
}

/** Looks up a post by slug from DB, falling back to static. */
export function useBlogPost(slug: string | undefined, initialPost?: BlogPost) {
  const [post, setPost] = useState<BlogPost | null | undefined>(initialPost);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      return;
    }
    let cancelled = false;
    const editorial = searchGuides.find((post) => post.slug === slug);
    if (editorial) {
      setPost(editorial);
      return;
    }
    setPost(initialPost);
    (async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("slug, title, description, content, category, keywords, reading_time, published_at")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;
      if (data) {
        setPost({
          slug: data.slug,
          title: data.title,
          description: data.description,
          content: data.content,
          category: data.category,
          keywords: (data.keywords as string[]) || [],
          readingTime: data.reading_time,
          publishedAt: (data.published_at as string).slice(0, 10),
        });
        return;
      }
      const fallback = staticPosts.find((p) => p.slug === slug);
      if (!fallback) {
        setPost(null);
        return;
      }
      // Article bodies live in a separate, lazily-loaded module so list pages
      // never download 100 KB of prose.
      const { blogContent } = await import("@/data/blog-content");
      if (cancelled) return;
      setPost({ ...fallback, content: blogContent[fallback.slug] ?? "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, initialPost]);

  return post;
}
