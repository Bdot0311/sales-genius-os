import salesosLogo from "@/assets/salesos-logo.webp";
import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="border-t border-border py-12 sm:py-16 bg-background">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Logo and description */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-8 mb-8">
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <img src={salesosLogo} alt="SalesOS" className="w-7 h-7 rounded-lg" />
              <span className="text-lg font-bold">SalesOS</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Sales execution system. Find leads, send emails, close deals.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-12 text-sm">
            <div>
              <h4 className="font-medium mb-3">Product</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="/pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#integrations" className="hover:text-foreground transition-colors">Integrations</a></li>
                <li><a href="/api-docs" className="hover:text-foreground transition-colors">API</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-3">Legal</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link></li>
                <li><Link to="/security" className="hover:text-foreground transition-colors">Security</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} BDØT Industries LLC
        </div>
      </div>
    </footer>
  );
};
