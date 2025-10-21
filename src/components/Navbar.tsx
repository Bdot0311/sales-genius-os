import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import salesosLogo from "@/assets/salesos-logo.png";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={salesosLogo} alt="SalesOS Logo" className="w-8 h-8 rounded-lg" />
          <span className="text-xl font-bold">SalesOS</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <Button variant="ghost" onClick={() => handleNavigation('#features')}>Features</Button>
          <Button variant="ghost" onClick={() => handleNavigation('/pricing')}>Pricing</Button>
          <Button variant="ghost" onClick={() => handleNavigation('#integrations')}>Integrations</Button>
          <Button variant="ghost" onClick={() => handleNavigation('/api-docs')}>API Docs</Button>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="hero" onClick={() => navigate("/auth")}>
            Sign In
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
