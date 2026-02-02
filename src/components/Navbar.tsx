import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useWhiteLabel } from "@/hooks/use-white-label";

// Use public path for maximum compatibility across all devices
const LOGO_URL = "/salesos-logo-small.webp";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { settings: whiteLabelSettings } = useWhiteLabel();

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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        isScrolled 
          ? 'bg-background/95 backdrop-blur-md border-b border-border/40' 
          : 'bg-transparent'
      }`}
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
                  />
                  <span className="text-base sm:text-lg font-semibold whitespace-nowrap">
                    <span className="text-foreground">{whiteLabelSettings?.company_name || "Sales"}</span>
                    {!whiteLabelSettings?.company_name && (
                      <span className="text-primary">OS</span>
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
                  className="px-3 lg:px-4 py-2 text-sm text-muted-foreground hover:text-primary transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Button 
                variant="ghost" 
                size="sm"
                className="text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 font-medium px-3"
                onClick={() => navigate("/auth")}
              >
                Login
              </Button>
              
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
          isMenuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
        role="menu"
      >
        <div className="bg-background/95 backdrop-blur-md border-b border-border/40">
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
            <div className="pt-3 border-t border-border/40 mt-3">
              <Button 
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => navigate("/auth")}
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
