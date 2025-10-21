import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Navbar = () => {
  const navigate = useNavigate();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg" />
          <span className="text-xl font-bold">SalesOS</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Features</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Pricing</a>
          <a href="#integrations" className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Integrations</a>
          <a href="#demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Demo</a>
          <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Testimonials</a>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" className="hidden md:inline-flex" onClick={() => navigate("/auth")}>
            Sign In
          </Button>
          <Button variant="hero" onClick={() => navigate("/auth")}>
            Get Started
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
