import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, Search, ArrowLeft, BookOpen, DollarSign, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404: User attempted to access non-existent route:", location.pathname);
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
        description="The page you're looking for doesn't exist. Navigate back to OutReign homepage or explore our popular pages."
        noIndex={true}
      />
      
      <div
        className="relative flex min-h-screen flex-col items-center justify-center px-4 overflow-hidden"
        style={{ background: "hsl(261 75% 2%)" }}
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
        <div
          className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none sm:h-[560px] sm:w-[560px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-2xl text-center">
          {/* 404 Hero */}
          <div className="mb-10">
            <h1
              className="font-display text-8xl sm:text-9xl mb-4 animate-shiny"
              style={{
                fontWeight: 800,
                backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "url(#c3-noise)",
              }}
            >
              404
            </h1>
            <h2 className="text-2xl font-semibold text-white mb-2">
              Page not found
            </h2>
            <p className="text-white/55 max-w-md mx-auto">
              The page you're looking for doesn't exist or has been moved. Let's
              get you back on track.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Button asChild size="lg" className="gap-2 rounded-full cta-pill-glow">
              <Link to="/">
                <Home className="h-4 w-4" />
                Go to homepage
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="gap-2 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
            >
              <Link to="/help">
                <Search className="h-4 w-4" />
                Search help center
              </Link>
            </Button>
          </div>

          {/* Popular Pages */}
          <div
            className="border-t pt-8"
            style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
          >
            <p className="mb-5 text-[10px] uppercase tracking-[0.25em] text-white/70">
              Popular pages
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {popularPages.map((page) => (
                <Link
                  key={page.path}
                  to={page.path}
                  className="flex items-start gap-3 p-4 rounded-xl transition-all text-left group"
                  style={{
                    background: "hsl(261 75% 50% / 0.04)",
                    border: "1px solid hsl(261 75% 50% / 0.14)",
                  }}
                >
                  <page.icon className="h-5 w-5 mt-0.5 transition-colors" style={{ color: "hsl(0 0% 100% / 0.5)" }} />
                  <div>
                    <div className="font-medium text-white transition-colors">
                      {page.name}
                    </div>
                    <div className="text-sm text-white/55">
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
              className="gap-2 text-white/55 hover:text-white hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound;
