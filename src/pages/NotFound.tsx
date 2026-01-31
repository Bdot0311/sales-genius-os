import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, Search, ArrowLeft, BookOpen, DollarSign, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const popularPages = [
    { name: "Home", path: "/", icon: Home, description: "Return to the main page" },
    { name: "Pricing", path: "/pricing", icon: DollarSign, description: "View our pricing plans" },
    { name: "API Docs", path: "/api-docs", icon: BookOpen, description: "Explore our API documentation" },
    { name: "Help Center", path: "/help", icon: HelpCircle, description: "Get help and support" },
  ];

  return (
    <>
      <SEOHead 
        title="Page Not Found - 404"
        description="The page you're looking for doesn't exist. Navigate back to SalesOS homepage or explore our popular pages."
        noIndex={true}
      />
      
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-2xl text-center">
          {/* 404 Hero */}
          <div className="mb-8">
            <h1 className="text-8xl font-bold text-primary mb-4">404</h1>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Page Not Found
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Oops! The page you're looking for doesn't exist or has been moved. 
              Let's get you back on track.
            </p>
          </div>

          {/* Search/Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Button asChild size="lg" className="gap-2">
              <Link to="/">
                <Home className="h-4 w-4" />
                Go to Homepage
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/help">
                <Search className="h-4 w-4" />
                Search Help Center
              </Link>
            </Button>
          </div>

          {/* Popular Pages */}
          <div className="border-t border-border pt-8">
            <h3 className="text-lg font-medium text-foreground mb-6">
              Popular Pages
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {popularPages.map((page) => (
                <Link
                  key={page.path}
                  to={page.path}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left group"
                >
                  <page.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary mt-0.5" />
                  <div>
                    <div className="font-medium text-foreground group-hover:text-primary">
                      {page.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {page.description}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Back button */}
          <div className="mt-8">
            <Button
              variant="ghost"
              onClick={() => window.history.back()}
              className="gap-2 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound;
