import salesosLogo from "@/assets/salesos-logo.webp";
import { Link } from "react-router-dom";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Integrations", href: "#integrations" },
    { label: "Changelog", href: "#" },
  ],
  resources: [
    { label: "Help Center", href: "/help" },
    { label: "API Docs", href: "/api-docs" },
    { label: "API Status", href: "/api-status" },
    { label: "Contact", href: "mailto:support@bdotindustries.com" },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Security", href: "/security" },
  ],
};

export const Footer = () => {
  return (
    <footer className="py-12 md:py-16 lg:py-20 bg-muted/30 border-t border-border/50">
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12 mb-10 md:mb-12">
            {/* Brand - full width on mobile, 2 cols on larger */}
            <div className="col-span-2 md:col-span-4 lg:col-span-2 mb-4 lg:mb-0">
              <div className="flex items-center gap-2.5 mb-4">
                <img 
                  src={salesosLogo} 
                  alt="SalesOS Logo" 
                  className="w-8 h-8 rounded-lg" 
                />
                <span className="text-lg font-semibold">
                  <span className="text-foreground">Sales</span>
                  <span className="text-primary">OS</span>
                </span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                The AI-powered sales platform that helps you find leads, personalize outreach, and close more deals.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-sm mb-3 md:mb-4">Product</h4>
              <ul className="space-y-2.5 md:space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link 
                        to={link.href} 
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a 
                        href={link.href} 
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
              <h4 className="font-semibold text-sm mb-3 md:mb-4">Resources</h4>
              <ul className="space-y-2.5 md:space-y-3">
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link 
                        to={link.href} 
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a 
                        href={link.href} 
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-sm mb-3 md:mb-4">Legal</h4>
              <ul className="space-y-2.5 md:space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="pt-6 md:pt-8 border-t border-border/50">
            <p className="text-xs sm:text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
