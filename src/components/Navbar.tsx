import { Button } from "@/components/ui/button";
import { Menu, X, ArrowRight } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

// Use public path for maximum compatibility across all devices
const LOGO_URL = "/salesos-logo-small.webp";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
<<<<<<< HEAD
  const [whiteLabelSettings, setWhiteLabelSettings] = useState<any>(null);

  // Defer white-label settings load to avoid blocking initial render
  useEffect(() => {
    const id = setTimeout(() => {
      import("@/hooks/use-white-label").catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, []);
=======
>>>>>>> origin/main

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavigation = (path: string) => {
    if (path.startsWith('#')) {
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
          requestAnimationFrame(() => {
            const element = document.querySelector(path);
            element?.scrollIntoView({ behavior: 'smooth' });
          });
        }, 100);
      } else {
        requestAnimationFrame(() => {
          const element = document.querySelector(path);
          element?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    } else {
      navigate(path);
    }
    setIsMenuOpen(false);
  };

  const navLinks = [
    { label: "Features", path: "#features" },
    { label: "Pricing", path: "/pricing" },
    { label: "Integrations", path: "#integrations" },
<<<<<<< HEAD
=======
    { label: "Blog", path: "/blog" },
>>>>>>> origin/main
    { label: "Help", path: "/help" },
  ];

  return (
    <nav
      className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
<<<<<<< HEAD
        isScrolled ? 'backdrop-blur-xl border-b' : ''
=======
        isScrolled ? 'border-b' : ''
>>>>>>> origin/main
      }`}
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        background: isScrolled ? 'hsl(0 0% 3% / 0.92)' : 'transparent',
        borderColor: isScrolled ? 'hsl(0 0% 100% / 0.07)' : 'transparent',
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="flex items-center justify-between h-14 sm:h-16">

            {/* Logo */}
            <div
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer flex-shrink-0"
              onClick={() => navigate('/')}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
              aria-label="SalesOS home"
            >
<<<<<<< HEAD
              {whiteLabelSettings?.logo_url ? (
                <img
                  src={whiteLabelSettings.logo_url}
                  alt={whiteLabelSettings.company_name || "Logo"}
                  className="h-7 sm:h-8"
                />
              ) : (
                <>
                  <img
                    src={LOGO_URL}
                    alt="SalesOS Logo"
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-contain"
                    width={32}
                    height={32}
                    loading="eager"
                    fetchPriority="high"
                  />
                  <span className="text-base sm:text-lg font-semibold whitespace-nowrap">
                    <span className="text-foreground">{whiteLabelSettings?.company_name || "Sales"}</span>
                    {!whiteLabelSettings?.company_name && (
                      <span className="text-primary">OS</span>
                    )}
                  </span>
                </>
              )}
=======
              <>
                <img
                  src={LOGO_URL}
                  alt="SalesOS Logo"
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-contain"
                  width={32}
                  height={32}
                  loading="eager"
                  fetchPriority="high"
                />
                <span className="text-base sm:text-lg font-semibold whitespace-nowrap">
                  <span className="text-foreground">Sales</span>
                  <span className="text-primary">OS</span>
                </span>
              </>
>>>>>>> origin/main
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-0.5">
<<<<<<< HEAD
              {navLinks.map((link) => {
                const isActive = !link.path.startsWith('#') && location.pathname === link.path;
                return (
                  <button
                    key={link.label}
                    onClick={() => handleNavigation(link.path)}
                    className={`px-3 lg:px-4 py-2 text-sm transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 hover:text-white/85 ${
                      isActive ? 'text-white/90 border-b-2 border-primary rounded-none pb-[6px]' : 'text-white/45'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {link.label}
                  </button>
                );
              })}
=======
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => handleNavigation(link.path)}
                  className="px-3 lg:px-4 py-2 text-sm transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  style={{ color: 'hsl(0 0% 100% / 0.45)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'hsl(0 0% 100% / 0.85)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'hsl(0 0% 100% / 0.45)')}
                >
                  {link.label}
                </button>
              ))}
>>>>>>> origin/main
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3">
              {/* De-emphasized Login */}
              <button
<<<<<<< HEAD
                type="button"
                className="hidden md:block text-sm transition-colors text-white/40 hover:text-white/75"
=======
                className="hidden md:block text-sm transition-colors"
                style={{ color: 'hsl(0 0% 100% / 0.4)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'hsl(0 0% 100% / 0.75)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'hsl(0 0% 100% / 0.4)')}
>>>>>>> origin/main
                onClick={() => navigate("/auth")}
              >
                Log in
              </button>

              {/* Primary CTA — pill button */}
              <button
<<<<<<< HEAD
                type="button"
=======
>>>>>>> origin/main
                className="hidden md:inline-flex items-center gap-1.5 px-5 rounded-full text-sm font-semibold text-white cta-pill-glow"
                style={{
                  height: '38px',
                  background: 'linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)',
                }}
                onClick={() => navigate("/auth")}
<<<<<<< HEAD
                aria-label="Start for free"
              >
                Start for free
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
=======
              >
                Sign up
                <ArrowRight className="w-3.5 h-3.5" />
>>>>>>> origin/main
              </button>

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden w-9 h-9"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-expanded={isMenuOpen}
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>

          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
<<<<<<< HEAD
          isMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
        role="menu"
      >
        <div className="bg-background/95 backdrop-blur-md border-b border-border/40">
=======
          isMenuOpen ? 'max-h-[520px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        role="menu"
      >
          <div className="bg-background/95 border-b border-border/40">
>>>>>>> origin/main
          <div className="container mx-auto px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavigation(link.path)}
                className="w-full text-left px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors text-base"
                role="menuitem"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-3 border-t border-border/40 mt-3 flex flex-col gap-2">
              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90 font-medium"
                onClick={() => { navigate("/auth"); setIsMenuOpen(false); }}
              >
<<<<<<< HEAD
                Start for free
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
=======
                Start free
                <ArrowRight className="w-4 h-4 ml-2" />
>>>>>>> origin/main
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => { navigate("/auth"); setIsMenuOpen(false); }}
              >
                Login
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
