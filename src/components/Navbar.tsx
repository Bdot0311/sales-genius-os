import { Button } from "@/components/ui/button";
import { Menu, X, ArrowRight } from "lucide-react";
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
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      isScrolled 
        ? 'bg-background/70 backdrop-blur-2xl border-b border-border/30 shadow-lg shadow-background/50' 
        : 'bg-transparent'
    }`}>
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo with glow on hover */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer group" 
            onClick={() => navigate('/')}
          >
            {whiteLabelSettings?.logo_url ? (
              <img 
                src={whiteLabelSettings.logo_url} 
                alt={whiteLabelSettings.company_name || "Logo"} 
                className="h-8 transition-transform group-hover:scale-105" 
              />
            ) : (
              <>
                <div className="relative">
                  <img 
                    src={salesosLogo} 
                    alt="SalesOS Logo" 
                    className="w-8 h-8 rounded-lg transition-transform group-hover:scale-110" 
                    width={32} 
                    height={32} 
                  />
                  <div className="absolute inset-0 rounded-lg bg-primary/30 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-lg font-semibold">
                  <span className="text-foreground">{whiteLabelSettings?.company_name || "Sales"}</span>
                  {!whiteLabelSettings?.company_name && (
                    <span className="text-primary">OS</span>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Desktop Navigation with hover effects */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavigation(link.path)}
                className="relative px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all duration-300 rounded-lg group"
              >
                <span className="relative z-10">{link.label}</span>
                <div className="absolute inset-0 rounded-lg bg-muted/0 group-hover:bg-muted/50 transition-colors duration-300" />
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-primary rounded-full group-hover:w-1/2 transition-all duration-300" />
              </button>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm"
              className="hidden sm:inline-flex text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/auth")}
            >
              Log in
            </Button>
            <Button 
              size="sm" 
              className="bg-foreground text-background hover:bg-foreground/90 font-medium magnetic-btn group"
              onClick={() => navigate("/auth")}
            >
              Get started
              <ArrowRight className="w-3.5 h-3.5 ml-1.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
            </Button>
            
            {/* Mobile menu button */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu with slide animation */}
      <div className={`md:hidden overflow-hidden transition-all duration-500 ${
        isMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="bg-background/95 backdrop-blur-2xl border-b border-border/30">
          <div className="container mx-auto px-6 py-4 space-y-1">
            {navLinks.map((link, i) => (
              <button
                key={link.label}
                onClick={() => handleNavigation(link.path)}
                className="w-full text-left px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all duration-300"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {link.label}
              </button>
            ))}
            <div className="pt-4 border-t border-border/50 mt-4">
              <Button 
                className="w-full bg-foreground text-background hover:bg-foreground/90 magnetic-btn"
                onClick={() => navigate("/auth")}
              >
                Get started
              </Button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
