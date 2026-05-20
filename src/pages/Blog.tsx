import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";
import { useAllBlogPosts } from "@/hooks/useBlogPosts";
import { lazy, Suspense } from "react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

const Blog = () => {
  const { posts } = useAllBlogPosts();
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

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="blog-heading"
          >
            {/* Dot grid */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
              aria-hidden="true"
            />
            {/* Orbs */}
            <div
              className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none sm:h-[560px] sm:w-[560px]"
              style={{
                background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, hsl(261 75% 55% / 0.04) 50%, transparent 70%)",
                filter: "blur(40px)",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-80px] right-[-120px] h-[380px] w-[380px] rounded-full hero-orb pointer-events-none sm:h-[500px] sm:w-[500px]"
              style={{
                background: "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.12) 0%, transparent 70%)",
                filter: "blur(50px)",
                animationDelay: "6s",
              }}
              aria-hidden="true"
            />
            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-4xl text-center">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Blog · Outbound that works
              </span>

              <h1
                id="blog-heading"
                className="font-display mb-5 text-4xl leading-[1.05] sm:text-5xl md:text-6xl"
                style={{ color: "hsl(0 0% 95%)", fontWeight: 800, letterSpacing: "-0.02em" }}
              >
                Practical outbound.{" "}
                <span
                  className="font-display italic animate-shiny"
                  style={{
                    backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "url(#c3-noise)",
                  }}
                >
                  No fluff.
                </span>
              </h1>
              <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                Guides on B2B lead generation, ICP scoring, and cold email for founders and lean sales teams.
              </p>
            </div>
          </section>

          {/* Post list */}
          <section className="container mx-auto px-5 sm:px-6 max-w-3xl pb-24" style={divider}>
            <div className="flex flex-col gap-0 pt-2">
              {posts.map((post) => (
                <article
                  key={post.slug}
                  className="py-10"
                  style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}
                >
                  <p className="text-[10px] uppercase tracking-widest mb-3 font-medium" style={{ color: "hsl(261 75% 55%)" }}>
                    <time dateTime={post.publishedAt}>
                      {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </time>
                    {" · "}{post.category} · {post.readingTime}
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
            </div>
          </section>
        </main>

        <Suspense fallback={null}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default Blog;
