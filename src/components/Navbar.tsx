import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import salesosLogo from "@/assets/salesos-logo.png";
import { useWhiteLabel } from "@/hooks/use-white-label";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { settings: whiteLabelSettings } = useWhiteLabel();

  const handleNavigation = (path: string) => {
    if (path.startsWith('#')) {
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
          const element = document.querySelector(path);
          element?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        const element = document.querySelector(path);
        element?.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      navigate(path);
    }
    setIsMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          {whiteLabelSettings?.logo_url ? (
            <img src={whiteLabelSettings.logo_url} alt={whiteLabelSettings.company_name || "Logo"} className="h-7 sm:h-8" />
          ) : (
            <>
              <img src={salesosLogo} alt="SalesOS Logo" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg" />
              <span className="text-lg sm:text-xl font-bold">{whiteLabelSettings?.company_name || "SalesOS"}</span>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          <Button variant="ghost" onClick={() => handleNavigation('#features')}>Features</Button>
          <Button variant="ghost" onClick={() => handleNavigation('/pricing')}>Pricing</Button>
          <Button variant="ghost" onClick={() => handleNavigation('#integrations')}>Integrations</Button>
          <Button variant="ghost" onClick={() => handleNavigation('/api-docs')}>API Docs</Button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="hero" size="sm" className="sm:h-10" onClick={() => navigate("/auth")}>
            Sign In
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
      
      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-md border-b border-border">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
            <Button variant="ghost" className="w-full justify-start" onClick={() => handleNavigation('#features')}>Features</Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => handleNavigation('/pricing')}>Pricing</Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => handleNavigation('#integrations')}>Integrations</Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => handleNavigation('/api-docs')}>API Docs</Button>
          </div>
        </div>
      )}
    </nav>
  );
};
