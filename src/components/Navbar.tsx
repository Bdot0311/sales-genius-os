import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import salesosLogo from "@/assets/salesos-logo-64.webp";
import { useWhiteLabel } from "@/hooks/use-white-label";

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
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div 
              className="flex items-center gap-2.5 cursor-pointer" 
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
                  className="h-8" 
                />
              ) : (
                <>
                  <img 
                    src={salesosLogo} 
                    alt="SalesOS Logo" 
                    className="w-8 h-8 rounded-lg" 
                    width={32} 
                    height={32} 
                  />
                  <span className="text-lg font-semibold">
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
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm"
                className="text-muted-foreground hover:text-foreground font-medium"
                onClick={() => navigate("/auth")}
              >
                Login
              </Button>
              
              {/* Mobile menu button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden"
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
          <div className="container mx-auto px-6 py-4 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavigation(link.path)}
                className="w-full text-left px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                role="menuitem"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-4 border-t border-border/40 mt-4">
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
