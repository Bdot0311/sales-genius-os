import { useParams, useSearchParams, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";
import { lazy, Suspense } from "react";
import {
  HelpSearch,
  HelpCategoryCard,
  HelpArticle as HelpArticleComponent,
  ContactSupport,
  helpCategories,
  getPopularArticles,
  getArticlesByCategory,
  getArticleBySlug,
  searchArticles,
  getCategoryInfo,
} from "@/components/help";
import {
  Book,
  FileText,
  Activity,
  ArrowLeft,
  Clock,
  ChevronRight,
} from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

/**
 * Dark canvas wrapper that matches the landing page aesthetic
 * (hsl(0 0% 3%) background, consistent nav + footer).
 */
const HelpCanvas = ({ children }: { children: React.ReactNode }) => (
  <div
    className="min-h-screen overflow-x-hidden flex flex-col"
    style={{ background: "hsl(261 75% 2%)" }}
  >
    <Navbar />
    {children}
    <Suspense fallback={<SectionLoader />}>
      <FooterSection />
    </Suspense>
  </div>
);

const HelpCenter = () => {
  const { category, slug } = useParams();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search");

  // Article view
  if (slug) {
    const article = getArticleBySlug(slug);
    if (!article) {
      return (
        <HelpCanvas>
          <main className="flex-1 pt-32 pb-16 container mx-auto px-6">
            <div className="text-center py-16">
              <h1 className="font-display text-3xl sm:text-4xl mb-4">
                Article not found
              </h1>
              <p className="mb-6" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                The article you're looking for doesn't exist.
              </p>
              <Link
                to="/help"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
              >
                Back to help center
              </Link>
            </div>
          </main>
        </HelpCanvas>
      );
    }

    return (
      <HelpCanvas>
        <SEOHead
          title={`${article.title} - Help Center`}
          description={article.description}
          canonicalUrl={`https://salesos.alephwavex.io/help/article/${article.slug}`}
        />
        <main className="flex-1 pt-28 sm:pt-32 pb-16 container mx-auto px-5 sm:px-6">
          <HelpArticleComponent article={article} />
        </main>
      </HelpCanvas>
    );
  }

  // Category view
  if (category) {
    const categoryInfo = getCategoryInfo(category as any);
    const articles = getArticlesByCategory(category as any);

    if (!categoryInfo) {
      return (
        <HelpCanvas>
          <main className="flex-1 pt-32 pb-16 container mx-auto px-6">
            <div className="text-center py-16">
              <h1 className="font-display text-3xl sm:text-4xl mb-4">
                Category not found
              </h1>
              <Link
                to="/help"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
              >
                Back to help center
              </Link>
            </div>
          </main>
        </HelpCanvas>
      );
    }

    return (
      <HelpCanvas>
        <SEOHead
          title={`${categoryInfo.title} - Help Center`}
          description={categoryInfo.description}
          canonicalUrl={`https://salesos.alephwavex.io/help/category/${category}`}
        />
        <main className="flex-1 pt-28 sm:pt-32 pb-16 container mx-auto px-5 sm:px-6">
          <nav className="flex items-center gap-2 text-sm text-white/75 mb-6">
            <Link to="/help" className="hover:text-white transition-colors">
              Help Center
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-white/80">{categoryInfo.title}</span>
          </nav>

          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 mb-6 text-sm transition-colors"
            style={{ color: "hsl(0 0% 100% / 0.45)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 80%)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.45)")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to help center
          </button>

          <h1 className="font-display text-3xl sm:text-4xl mb-2" style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 92%)" }}>
            {categoryInfo.title}
          </h1>
          <p className="text-white/55 mb-8">{categoryInfo.description}</p>

          <div className="grid gap-3">
            {articles.map((article) => (
              <Link key={article.id} to={`/help/article/${article.slug}`}>
                <div
                  className="p-4 sm:p-5 rounded-xl transition-all duration-200"
                  style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium" style={{ color: "hsl(0 0% 92%)" }}>{article.title}</h3>
                    <div className="flex items-center text-xs shrink-0" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                      <Clock className="h-3 w-3 mr-1" />
                      {article.readTime} min
                    </div>
                  </div>
                  <p className="text-sm mt-1" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                    {article.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </main>
        <ContactSupport />
      </HelpCanvas>
    );
  }

  // Search results view
  if (searchQuery) {
    const results = searchArticles(searchQuery);

    return (
      <HelpCanvas>
        <SEOHead
          title={`Search: ${searchQuery} - Help Center`}
          description={`Search results for "${searchQuery}" in SalesOS Help Center`}
          canonicalUrl="https://salesos.alephwavex.io/help"
        />
        <main className="flex-1 pt-28 sm:pt-32 pb-16 container mx-auto px-5 sm:px-6">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 mb-6 text-sm transition-colors"
            style={{ color: "hsl(0 0% 100% / 0.45)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 80%)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.45)")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to help center
          </button>

          <h1 className="font-display text-2xl sm:text-3xl mb-2" style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 92%)" }}>
            Search results
          </h1>
          <p className="mb-8" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
            {results.length} result{results.length !== 1 ? "s" : ""} for "{searchQuery}"
          </p>

          {results.length > 0 ? (
            <div className="grid gap-3">
              {results.map((article) => (
                <Link key={article.id} to={`/help/article/${article.slug}`}>
                  <div
                    className="p-4 sm:p-5 rounded-xl transition-all duration-200"
                    style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: "hsl(261 75% 50% / 0.12)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(261 75% 65%)" }}
                      >
                        {getCategoryInfo(article.category)?.title}
                      </span>
                      <span className="text-xs" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                        {article.readTime} min read
                      </span>
                    </div>
                    <h3 className="font-medium" style={{ color: "hsl(0 0% 92%)" }}>{article.title}</h3>
                    <p className="text-sm mt-1" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                      {article.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="mb-4" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                No articles found for your search.
              </p>
              <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.4)" }}>
                Try different keywords or{" "}
                <a
                  href="mailto:support@bdotindustries.com"
                  className="hover:underline"
                  style={{ color: "hsl(261 75% 65%)" }}
                >
                  contact support
                </a>
              </p>
            </div>
          )}
        </main>
        <ContactSupport />
      </HelpCanvas>
    );
  }

  // Main help center view
  const popularArticles = getPopularArticles();

  return (
    <HelpCanvas>
      <SEOHead
        title="Help Center - SalesOS Support & Documentation"
        description="Get instant answers to your SalesOS questions. Browse guides, troubleshooting tips, API documentation, and contact our support team."
        keywords="SalesOS help, support, documentation, guides, troubleshooting, FAQ"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://salesos.alephwavex.io" },
          { name: "Help Center", url: "https://salesos.alephwavex.io/help" },
        ]}
      />

      <main className="flex-1">
        {/* Hero */}
        <section
          className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-14 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-20"
          aria-labelledby="help-heading"
        >
          {/* Dot grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
            aria-hidden="true"
          />
          {/* Orbs */}
          <div
            className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none sm:h-[560px] sm:w-[560px]"
            style={{
              background:
                "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, hsl(261 75% 55% / 0.04) 50%, transparent 70%)",
              filter: "blur(40px)",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute top-[-80px] right-[-120px] h-[380px] w-[380px] rounded-full hero-orb pointer-events-none sm:h-[500px] sm:w-[500px]"
            style={{
              background:
                "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.12) 0%, transparent 70%)",
              filter: "blur(50px)",
              animationDelay: "6s",
            }}
            aria-hidden="true"
          />
          <div className="noise-texture" aria-hidden="true" />

          <div className="relative z-10 container mx-auto px-5 sm:px-6">
            <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Help center · Usually answers in seconds
              </span>

              <h1
                id="help-heading"
                className="font-display mb-5 text-4xl leading-[1.05] sm:text-5xl md:text-6xl"
              >
                How can we{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 70% 70%) 100%)",
                  }}
                >
                  help you?
                </span>
              </h1>
              <p className="text-base sm:text-lg text-white/60 mb-8 max-w-xl mx-auto">
                Guides, documentation, and answers to get the most out of SalesOS.
              </p>
              <HelpSearch className="max-w-2xl mx-auto w-full" />
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="py-8" style={{ borderTop: "1px solid hsl(261 75% 50% / 0.18)" }}>
          <div className="container mx-auto px-5 sm:px-6">
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { to: "/api-docs", label: "API Documentation", Icon: Book, isLink: true },
                { to: "/api-status", label: "System Status", Icon: Activity, isLink: true },
                { to: "mailto:support@bdotindustries.com", label: "Contact Support", Icon: FileText, isLink: false },
              ].map(({ to, label, Icon, isLink }) => (
                isLink ? (
                  <Link
                    key={label}
                    to={to}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 100% / 0.7)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
                  >
                    <Icon className="h-4 w-4" style={{ color: "hsl(261 75% 65%)" }} />
                    {label}
                  </Link>
                ) : (
                  <a
                    key={label}
                    href={to}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 100% / 0.7)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
                  >
                    <Icon className="h-4 w-4" style={{ color: "hsl(261 75% 65%)" }} />
                    {label}
                  </a>
                )
              ))}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-5 sm:px-6">
            <p className="font-serif italic font-thin text-base text-center text-purple-500 mb-3">
              Documentation
            </p>
            <h2 className="font-display text-center mb-10 sm:mb-12" style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}>
              Browse by category
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-[1120px] mx-auto">
              {helpCategories.map((category) => (
                <HelpCategoryCard key={category.id} category={category} />
              ))}
            </div>
          </div>
        </section>

        {/* Popular Articles */}
        <section
          className="py-14 md:py-20"
          style={{ background: "hsl(261 75% 2%)" }}
        >
          <div className="container mx-auto px-5 sm:px-6">
            <p className="font-serif italic font-thin text-base text-center text-purple-500 mb-3">
              Most read
            </p>
            <h2 className="font-display text-center mb-10" style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}>
              Popular articles
            </h2>
            <div className="max-w-3xl mx-auto space-y-3">
              {popularArticles.map((article) => (
                <details
                  key={article.id}
                  className="rounded-xl px-5 sm:px-6"
                  style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
                >
                  <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer list-none">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm sm:text-base" style={{ color: "hsl(0 0% 90%)" }}>
                        {article.title}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "hsl(261 75% 50% / 0.12)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(261 75% 65%)" }}
                      >
                        {getCategoryInfo(article.category)?.title}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 transition-transform duration-200" style={{ color: "hsl(261 75% 55% / 0.6)" }} />
                  </summary>
                  <div className="pb-4" style={{ borderTop: "1px solid hsl(261 75% 50% / 0.1)" }}>
                    <p className="pt-3 text-sm leading-relaxed mb-3" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                      {article.description}
                    </p>
                    <Link
                      to={`/help/article/${article.slug}`}
                      className="text-sm font-medium transition-colors"
                      style={{ color: "hsl(261 75% 65%)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 80%)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")}
                    >
                      Read full article →
                    </Link>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <ContactSupport />

        {/* Related Links for SEO */}
        <section
          className="py-12 border-t"
          style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
        >
          <div className="container mx-auto px-5 sm:px-6">
            <p className="mb-5 text-center text-[10px] uppercase tracking-[0.25em] text-white/70">
              Explore SalesOS
            </p>
            <nav aria-label="Related pages">
              <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
                {[
                  { to: "/", label: "Home" },
                  { to: "/pricing", label: "Pricing" },
                  { to: "/api-docs", label: "API Docs" },
                  { to: "/api-status", label: "System Status" },
                  { to: "/security", label: "Security" },
                  { to: "/privacy", label: "Privacy" },
                  { to: "/terms", label: "Terms" },
                ].map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="text-white/55 hover:text-white transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
      </main>
    </HelpCanvas>
  );
};

export default HelpCenter;
