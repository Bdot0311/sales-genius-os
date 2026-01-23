import salesosLogo from "@/assets/salesos-logo.webp";
import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="relative border-t border-border py-12 sm:py-16 md:py-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card to-background opacity-90"></div>
      <div className="container mx-auto px-6 sm:px-8 md:px-12 relative z-10">
        {/* Logo centered on mobile, shown first */}
        <div className="md:hidden text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img src={salesosLogo} alt="SalesOS Logo" className="w-7 h-7 rounded-lg" />
            <span className="text-lg font-bold">
              <span className="text-white">Sales</span>
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">OS</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            The AI-powered sales operating system that helps you close more deals, faster.
          </p>
        </div>

        {/* Logo + description for tablet/desktop */}
        <div className="hidden md:block text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src={salesosLogo} alt="SalesOS Logo" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-bold">
              <span className="text-white">Sales</span>
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">OS</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The AI-powered sales operating system that helps you close more deals, faster.
          </p>
        </div>

        {/* Product & Legal columns side by side, centered */}
        <div className="mb-6 sm:mb-8">
          <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto text-center md:max-w-none md:text-left">
            <div>
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Product</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors inline-block md:inline">Features</a></li>
                <li><a href="/pricing" className="hover:text-foreground transition-colors inline-block md:inline">Pricing</a></li>
                <li><a href="#integrations" className="hover:text-foreground transition-colors inline-block md:inline">Integrations</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Support</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li><Link to="/help" className="hover:text-foreground transition-colors inline-block md:inline">Help Center</Link></li>
                <li><Link to="/api-docs" className="hover:text-foreground transition-colors inline-block md:inline">API Docs</Link></li>
                <li><Link to="/api-status" className="hover:text-foreground transition-colors inline-block md:inline">API Status</Link></li>
                <li><a href="mailto:support@bdotindustries.com" className="hover:text-foreground transition-colors inline-block md:inline">Contact Us</a></li>
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
          © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
