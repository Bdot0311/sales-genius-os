import salesosLogo from "@/assets/salesos-logo.png";
import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="bg-card border-t border-border py-8 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Logo centered on mobile, shown first */}
        <div className="md:hidden text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img src={salesosLogo} alt="SalesOS Logo" className="w-7 h-7 rounded-lg" />
            <span className="text-lg font-bold">SalesOS</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            The AI-powered sales operating system that helps you close more deals, faster.
          </p>
        </div>

        {/* Product & Legal columns side by side, centered */}
        <div className="mb-6 sm:mb-8">
          <div className="grid grid-cols-2 gap-12 max-w-sm mx-auto text-center md:max-w-none md:text-left">
            <div>
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Product</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors inline-block md:inline">Features</a></li>
                <li><a href="/pricing" className="hover:text-foreground transition-colors inline-block md:inline">Pricing</a></li>
                <li><a href="#integrations" className="hover:text-foreground transition-colors inline-block md:inline">Integrations</a></li>
                <li><a href="/api-docs" className="hover:text-foreground transition-colors inline-block md:inline">API Docs</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Legal</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-foreground transition-colors inline-block md:inline">Privacy</Link></li>
                <li><Link to="/terms" className="hover:text-foreground transition-colors inline-block md:inline">Terms</Link></li>
                <li><Link to="/security" className="hover:text-foreground transition-colors inline-block md:inline">Security</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-6 sm:pt-8 border-t border-border text-center text-xs sm:text-sm text-muted-foreground">
          © 2025 BDØT Industries LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
