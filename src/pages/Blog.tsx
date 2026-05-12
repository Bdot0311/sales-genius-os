import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";
import { blogPosts } from "@/data/blog-posts";
import { lazy, Suspense } from "react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const Blog = () => {
  return (
    <>
      <SEOHead
        title="SalesOS Blog — Outbound Sales for Founders & B2B Teams"
        description="Practical guides on B2B lead generation, ICP scoring, cold email, and outbound sales for founders and small SDR teams."
        keywords="B2B lead generation tips, outbound sales for founders, cold email guides, ICP scoring, sales prospecting"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Blog", url: "https://salesos.alephwavex.io/blog" },
      ]} />

      <div className="min-h-screen" style={{ background: "hsl(0,0%,3%)" }}>
        <Navbar />

        <main className="container mx-auto px-6 py-24 max-w-3xl">
          {/* Header */}
          <div className="mb-16">
            <p className="text-[10px] uppercase tracking-[0.28em] mb-4 font-medium" style={{ color: "hsl(261 75% 60%)" }}>
              Blog
            </p>
            <h1
              className="font-display mb-4"
              style={{
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: "hsl(0 0% 95%)",
              }}
            >
              Outbound that actually works.
            </h1>
            <p className="text-base font-light leading-relaxed max-w-lg" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
              Practical guides on B2B lead generation, ICP scoring, and cold email for founders and small sales teams.
            </p>
          </div>

          {/* Post list */}
          <div className="flex flex-col gap-0">
            {blogPosts.map((post, i) => (
              <article
                key={post.slug}
                className="py-10"
                style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }}
              >
                <p className="text-[10px] uppercase tracking-widest mb-3 font-medium" style={{ color: "hsl(261 75% 55%)" }}>
                  {post.category} · {post.readingTime}
                </p>
                <h2 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "hsl(0 0% 90%)" }}>
                  <Link
                    to={`/blog/${post.slug}`}
                    className="transition-colors duration-150 hover:text-white"
                    style={{ color: "hsl(0 0% 90%)" }}
                  >
                    {post.title}
                  </Link>
                </h2>
                <p className="text-sm leading-relaxed mb-4 max-w-xl" style={{ color: "hsl(0 0% 100% / 0.42)" }}>
                  {post.description}
                </p>
                <Link
                  to={`/blog/${post.slug}`}
                  className="text-sm font-medium transition-colors duration-150"
                  style={{ color: "hsl(261 75% 62%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 78%)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 62%)")}
                >
                  Read article →
                </Link>
              </article>
            ))}
            <div style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }} />
          </div>
        </main>

        <Suspense fallback={null}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default Blog;
