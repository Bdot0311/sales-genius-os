import { Button } from "@/components/ui/button";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

// Use public path for maximum compatibility across all devices
const LOGO_URL = "/salesos-logo-small.webp";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [whiteLabelSettings, setWhiteLabelSettings] = useState<any>(null);

  // Defer white-label settings load to avoid blocking initial render
  useEffect(() => {
    const id = setTimeout(() => {
      import("@/hooks/use-white-label").catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, []);

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
    { label: "Help", path: "/help" },
  ];

  return (
    <nav
      className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'backdrop-blur-xl border-b' : ''
      }`}
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        background: isScrolled ? 'hsl(34 33% 96% / 0.85)' : 'transparent',
        borderColor: isScrolled ? 'hsl(28 10% 86%)' : 'transparent',
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">

          {/* Logo */}
          <div
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer flex-shrink-0"
            onClick={() => navigate('/')}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
            aria-label="SalesOS home"
          >
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
                <span className="text-base sm:text-lg font-semibold whitespace-nowrap tracking-tight">
                  <span style={{ color: "hsl(28 10% 14%)" }}>
                    {whiteLabelSettings?.company_name || "Sales"}
                  </span>
                  {!whiteLabelSettings?.company_name && (
                    <span style={{ color: "hsl(14 59% 52%)" }}>OS</span>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavigation(link.path)}
                className="rounded-md px-3.5 py-2 text-[14px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(14_59%_59%)]/60"
                style={{ color: 'hsl(28 8% 30%)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'hsl(14 59% 52%)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'hsl(28 8% 30%)')}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4">
            <button
              className="hidden md:block text-[14px] font-medium transition-colors"
              style={{ color: 'hsl(28 6% 38%)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'hsl(28 10% 14%)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'hsl(28 6% 38%)')}
              onClick={() => navigate("/auth")}
            >
              Log in
            </button>

            {/* Primary CTA — coral pill */}
            <button
              className="hidden md:inline-flex items-center gap-1.5 rounded-full px-5 text-[14px] font-semibold cta-pill-glow"
              style={{ height: '40px' }}
              onClick={() => navigate("/auth")}
            >
              Sign up
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden w-9 h-9"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              style={{ color: 'hsl(28 10% 14%)' }}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>

        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          isMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
        role="menu"
      >
        <div
          className="backdrop-blur-md"
          style={{
            background: "hsl(34 33% 96% / 0.96)",
            borderBottom: "1px solid hsl(28 10% 86%)",
          }}
        >
          <div className="container mx-auto px-5 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavigation(link.path)}
                className="w-full rounded-lg px-4 py-3 text-left text-[16px] font-medium transition-colors"
                style={{ color: "hsl(28 8% 26%)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(14 59% 52%)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(28 8% 26%)")}
                role="menuitem"
              >
                {link.label}
              </button>
            ))}
            <div
              className="pt-4 mt-2 flex flex-col gap-2"
              style={{ borderTop: "1px solid hsl(28 10% 88%)" }}
            >
              <button
                className="cta-pill-glow inline-flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
                onClick={() => { navigate("/auth"); setIsMenuOpen(false); }}
              >
                Start free
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <Button
                variant="ghost"
                className="w-full font-medium"
                style={{ color: "hsl(28 6% 38%)" }}
                onClick={() => { navigate("/auth"); setIsMenuOpen(false); }}
              >
                Log in
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
