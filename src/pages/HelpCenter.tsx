import { useParams, useSearchParams, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";
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
  HelpArticle
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
import { Book, FileText, Activity, ArrowLeft, Clock, ChevronRight } from "lucide-react";

const HelpCenter = () => {
  const { category, slug } = useParams();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search');

  // Article view
  if (slug) {
    const article = getArticleBySlug(slug);
    if (!article) {
      return (
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="flex-1 pt-24 pb-16 container mx-auto px-6">
            <div className="text-center py-16">
              <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
              <p className="text-muted-foreground mb-6">The article you're looking for doesn't exist.</p>
              <Link to="/help">
                <Button>Back to Help Center</Button>
              </Link>
            </div>
          </main>
          <Footer />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead
          title={`${article.title} - Help Center`}
          description={article.description}
          canonicalUrl={`https://salesos.alephwavex.io/help/article/${article.slug}`}
        />
        <Navbar />
        <main className="flex-1 pt-24 pb-16 container mx-auto px-6">
          <HelpArticleComponent article={article} />
        </main>
        <Footer />
      </div>
    );
  }

  // Category view
  if (category) {
    const categoryInfo = getCategoryInfo(category as any);
    const articles = getArticlesByCategory(category as any);

    if (!categoryInfo) {
      return (
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="flex-1 pt-24 pb-16 container mx-auto px-6">
            <div className="text-center py-16">
              <h1 className="text-2xl font-bold mb-4">Category Not Found</h1>
              <Link to="/help">
                <Button>Back to Help Center</Button>
              </Link>
            </div>
          </main>
          <Footer />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead
          title={`${categoryInfo.title} - Help Center`}
          description={categoryInfo.description}
          canonicalUrl={`https://salesos.alephwavex.io/help/category/${category}`}
        />
        <Navbar />
        <main className="flex-1 pt-24 pb-16 container mx-auto px-6">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link to="/help" className="hover:text-foreground transition-colors">Help Center</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">{categoryInfo.title}</span>
          </nav>

          <Link to="/help">
            <Button variant="ghost" size="sm" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Help Center
            </Button>
          </Link>

          <h1 className="text-3xl font-bold mb-2">{categoryInfo.title}</h1>
          <p className="text-muted-foreground mb-8">{categoryInfo.description}</p>

          <div className="grid gap-4">
            {articles.map((article) => (
              <Link key={article.id} to={`/help/article/${article.slug}`}>
                <Card className="p-4 hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">{article.title}</h3>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {article.readTime} min
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{article.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </main>
        <ContactSupport />
        <Footer />
      </div>
    );
  }

  // Search results view
  if (searchQuery) {
    const results = searchArticles(searchQuery);

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead
          title={`Search: ${searchQuery} - Help Center`}
          description={`Search results for "${searchQuery}" in SalesOS Help Center`}
          canonicalUrl="https://salesos.alephwavex.io/help"
        />
        <Navbar />
        <main className="flex-1 pt-24 pb-16 container mx-auto px-6">
          <Link to="/help">
            <Button variant="ghost" size="sm" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Help Center
            </Button>
          </Link>

          <h1 className="text-2xl font-bold mb-2">Search Results</h1>
          <p className="text-muted-foreground mb-8">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{searchQuery}"
          </p>

          {results.length > 0 ? (
            <div className="grid gap-4">
              {results.map((article) => (
                <Link key={article.id} to={`/help/article/${article.slug}`}>
                  <Card className="p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">{getCategoryInfo(article.category)?.title}</Badge>
                      <span className="text-xs text-muted-foreground">{article.readTime} min read</span>
                    </div>
                    <h3 className="font-medium text-foreground">{article.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{article.description}</p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No articles found for your search.</p>
              <p className="text-sm text-muted-foreground">
                Try different keywords or <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">contact support</a>
              </p>
            </div>
          )}
        </main>
        <ContactSupport />
        <Footer />
      </div>
    );
  }

  // Main help center view
  const popularArticles = getPopularArticles();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title="Help Center - SalesOS Support & Documentation"
        description="Get instant answers to your SalesOS questions. Guides, troubleshooting, API docs, and direct support."
        canonicalUrl="https://salesos.alephwavex.io/help"
        keywords="SalesOS help, support, documentation, guides, troubleshooting, FAQ"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://salesos.alephwavex.io" },
          { name: "Help Center", url: "https://salesos.alephwavex.io/help" }
        ]}
      />
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-32 pb-16 bg-gradient-to-b from-primary/5 to-background">
          <div className="container mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              How can we <span className="bg-gradient-primary bg-clip-text text-transparent">help you?</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              Find answers, guides, and documentation to get the most out of SalesOS
            </p>
            <HelpSearch className="max-w-2xl mx-auto" />
          </div>
        </section>

        {/* Quick Links */}
        <section className="py-8 border-b border-border">
          <div className="container mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/api-docs">
                <Button variant="outline" className="gap-2">
                  <Book className="h-4 w-4" />
                  API Documentation
                </Button>
              </Link>
              <Link to="/api-status">
                <Button variant="outline" className="gap-2">
                  <Activity className="h-4 w-4" />
                  System Status
                </Button>
              </Link>
              <a href="mailto:support@bdotindustries.com">
                <Button variant="outline" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Contact Support
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-16">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl font-bold mb-8 text-center">Browse by Category</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {helpCategories.map((category) => (
                <HelpCategoryCard key={category.id} category={category} />
              ))}
            </div>
          </div>
        </section>

        {/* Popular Articles */}
        <section className="py-16 bg-card/50">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl font-bold mb-8 text-center">Popular Articles</h2>
            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="space-y-4">
                {popularArticles.map((article, index) => (
                  <AccordionItem
                    key={article.id}
                    value={`item-${index}`}
                    className="bg-card border border-border rounded-lg px-6"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center gap-3 text-left">
                        <span className="font-medium">{article.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {getCategoryInfo(article.category)?.title}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-4">
                      <p className="mb-4">{article.description}</p>
                      <Link to={`/help/article/${article.slug}`}>
                        <Button variant="link" className="p-0 h-auto">
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
      </main>

      <Footer />
    </div>
  );
};

export default HelpCenter;
