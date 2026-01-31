import salesosLogo from "@/assets/salesos-logo.webp";
import { Link } from "react-router-dom";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Integrations", href: "#integrations" },
  ],
  resources: [
    { label: "Help Center", href: "/help" },
    { label: "API Docs", href: "/api-docs" },
    { label: "API Status", href: "/api-status" },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Security", href: "/security" },
  ],
};

export const FooterSection = () => {
  return (
    <footer className="py-16 md:py-20 bg-muted/20 border-t border-border/30">
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 mb-12">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <img 
                  src={salesosLogo} 
                  alt="SalesOS Logo" 
                  className="w-8 h-8 rounded-lg" 
                  width={32}
                  height={32}
                />
                <span className="text-lg font-semibold">
                  <span className="text-foreground">Sales</span>
                  <span className="text-primary">OS</span>
                </span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                AI-powered lead discovery and sales automation for B2B teams. Find, engage, and close more deals.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-foreground">Product</h4>
              <ul className="space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link 
                        to={link.href} 
                        className="text-sm text-muted-foreground hover:text-primary transition-colors duration-150"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a 
                        href={link.href} 
                        className="text-sm text-muted-foreground hover:text-primary transition-colors duration-150"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-foreground">Resources</h4>
              <ul className="space-y-3">
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm text-muted-foreground hover:text-primary transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-sm mb-4 text-foreground">Legal</h4>
              <ul className="space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm text-muted-foreground hover:text-primary transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="pt-8 border-t border-border/30">
            <p className="text-sm text-muted-foreground/70 text-center">
              © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
