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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Dark canvas wrapper that matches the landing page aesthetic
 * (hsl(0 0% 3%) background, consistent nav + footer).
 */
const HelpCanvas = ({ children }: { children: React.ReactNode }) => (
  <div
    className="min-h-screen text-foreground overflow-x-hidden flex flex-col"
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
              <p className="text-white/55 mb-6">
                The article you're looking for doesn't exist.
              </p>
              <Link to="/help">
                <Button className="rounded-full">
                  Back to help center
                </Button>
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
              <Link to="/help">
                <Button className="rounded-full">
                  Back to help center
                </Button>
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

          <Link to="/help">
            <Button
              variant="ghost"
              size="sm"
              className="mb-6 text-white/55 hover:text-white hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to help center
            </Button>
          </Link>

          <h1 className="font-display text-3xl sm:text-4xl mb-2">
            {categoryInfo.title}
          </h1>
          <p className="text-white/55 mb-8">{categoryInfo.description}</p>

          <div className="grid gap-3">
            {articles.map((article) => (
              <Link key={article.id} to={`/help/article/${article.slug}`}>
                <Card
                  className="p-4 sm:p-5 transition-colors"
                  style={{
                    background: "hsl(261 75% 50% / 0.04)",
                    border: "1px solid hsl(261 75% 50% / 0.14)",
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium text-white">{article.title}</h3>
                    <div className="flex items-center text-xs text-white/75 shrink-0">
                      <Clock className="h-3 w-3 mr-1" />
                      {article.readTime} min
                    </div>
                  </div>
                  <p className="text-sm text-white/55 mt-1">
                    {article.description}
                  </p>
                </Card>
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
          <Link to="/help">
            <Button
              variant="ghost"
              size="sm"
              className="mb-6 text-white/55 hover:text-white hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to help center
            </Button>
          </Link>

          <h1 className="font-display text-2xl sm:text-3xl mb-2">
            Search results
          </h1>
          <p className="text-white/55 mb-8">
            {results.length} result{results.length !== 1 ? "s" : ""} for “{searchQuery}”
          </p>

          {results.length > 0 ? (
            <div className="grid gap-3">
              {results.map((article) => (
                <Link key={article.id} to={`/help/article/${article.slug}`}>
                  <Card
                    className="p-4 sm:p-5 transition-colors"
                    style={{
                      background: "hsl(261 75% 50% / 0.04)",
                      border: "1px solid hsl(261 75% 50% / 0.14)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/20">
                        {getCategoryInfo(article.category)?.title}
                      </Badge>
                      <span className="text-xs text-white/75">
                        {article.readTime} min read
                      </span>
                    </div>
                    <h3 className="font-medium text-white">{article.title}</h3>
                    <p className="text-sm text-white/55 mt-1">
                      {article.description}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-white/55 mb-4">
                No articles found for your search.
              </p>
              <p className="text-sm text-white/45">
                Try different keywords or{" "}
                <a
                  href="mailto:support@bdotindustries.com"
                  className="text-primary hover:underline"
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
        <section
          className="py-8 border-t"
          style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
        >
          <div className="container mx-auto px-5 sm:px-6">
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/api-docs">
                <Button
                  variant="outline"
                  className="gap-2 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                >
                  <Book className="h-4 w-4" />
                  API Documentation
                </Button>
              </Link>
              <Link to="/api-status">
                <Button
                  variant="outline"
                  className="gap-2 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                >
                  <Activity className="h-4 w-4" />
                  System Status
                </Button>
              </Link>
              <a href="mailto:support@bdotindustries.com">
                <Button
                  variant="outline"
                  className="gap-2 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                >
                  <FileText className="h-4 w-4" />
                  Contact Support
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-5 sm:px-6">
            <p className="mb-3 text-center text-[10px] uppercase tracking-[0.25em] text-white/70">
              Documentation
            </p>
            <h2 className="text-center text-2xl sm:text-3xl font-semibold mb-10 sm:mb-12">
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
            <p className="mb-3 text-center text-[10px] uppercase tracking-[0.25em] text-white/70">
              Most read
            </p>
            <h2 className="text-center text-2xl sm:text-3xl font-semibold mb-10">
              Popular articles
            </h2>
            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="space-y-3">
                {popularArticles.map((article, index) => (
                  <AccordionItem
                    key={article.id}
                    value={`item-${index}`}
                    className="rounded-xl px-5 sm:px-6"
                    style={{
                      background: "hsl(261 75% 50% / 0.04)",
                      border: "1px solid hsl(261 75% 50% / 0.14)",
                    }}
                  >
                    <AccordionTrigger className="hover:no-underline py-4 text-left">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-white">
                          {article.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs border-white/10 bg-white/5 text-white/60"
                        >
                          {getCategoryInfo(article.category)?.title}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-white/60 pb-4">
                      <p className="mb-3">{article.description}</p>
                      <Link to={`/help/article/${article.slug}`}>
                        <Button
                          variant="link"
                          className="p-0 h-auto text-primary"
                        >
                          Read full article →
                        </Button>
                      </Link>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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
