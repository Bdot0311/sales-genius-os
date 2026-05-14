import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { blogPosts as staticPosts, type BlogPost } from "@/data/blog-posts";

/** Fetches DB posts, merges with static seeds, sorted newest-first, deduped by slug. */
export function useAllBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>(staticPosts);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("slug, title, description, content, category, keywords, reading_time, published_at")
        .order("published_at", { ascending: false });

      if (cancelled) return;
      if (error || !data) {
        setPosts([...staticPosts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
        setLoading(false);
        return;
      }

      const dbPosts: BlogPost[] = data.map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        content: p.content,
        category: p.category,
        keywords: (p.keywords as string[]) || [],
        readingTime: p.reading_time,
        publishedAt: (p.published_at as string).slice(0, 10),
      }));

      const seen = new Set(dbPosts.map((p) => p.slug));
      const merged = [...dbPosts, ...staticPosts.filter((p) => !seen.has(p.slug))];
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
export function useBlogPost(slug: string | undefined) {
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      return;
    }
    let cancelled = false;
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
      setPost(fallback ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return post;
}
