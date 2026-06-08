import salesosLogo from "@/assets/salesos-logo.webp";
import { Link } from "react-router-dom";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Integrations", href: "/pricing" },
  ],
  resources: [
    { label: "Blog", href: "/blog" },
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
    <footer className="py-16 md:py-20 border-t" style={{ background: "hsl(261 75% 2% / 0.88)", borderColor: "hsl(261 75% 50% / 0.18)" }}>
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
                  <span style={{ color: "hsl(0 0% 92%)" }}>Sales</span>
                  <span style={{ color: "hsl(261 75% 65%)" }}>OS</span>
                </span>
              </div>
              <p className="text-sm max-w-xs leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                Plain-English lead discovery and outbound workflow software for B2B teams that want to move from prospecting to outreach faster.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Product</h4>
              <ul className="space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link 
                        to={link.href} 
                        className="text-sm transition-colors duration-150" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a 
                        href={link.href} 
                        className="text-sm transition-colors duration-150" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
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
              <h4 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Resources</h4>
              <ul className="space-y-3">
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm transition-colors duration-150" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Legal</h4>
              <ul className="space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm transition-colors duration-150" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="pt-8 border-t flex flex-col items-center gap-4" style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}>
            <div className="flex flex-wrap items-center justify-center gap-6">
              <a href="https://sellwithboost.com" target="_blank" rel="noopener noreferrer">
                <img src="https://sellwithboost.com/badge/listing-dark.svg" alt="Listed on Sell With Boost" className="h-10 w-auto" width={160} height={40} loading="lazy" />
              </a>
              <a href="https://landingboost.app/badges/top-1" target="_blank" rel="noopener noreferrer">
                <img src="https://landingboost.app/badges/top1-dark.svg" alt="Top 1% Landing Page — Verified by LandingBoost" className="h-10 w-auto" width={200} height={40} loading="lazy" />
              </a>
              <a href="https://nicklaunches.com/products/salesos/?utm_source=salesos.alephwavex.io&utm_medium=badge&utm_campaign=featured" target="_blank" rel="noopener">
                <img src="https://nicklaunches.com/badges/featured-dark.svg" alt="SalesOS on Nick Launches" className="h-10 w-auto" width={244} height={56} loading="lazy" />
              </a>
            </div>
            <p className="text-sm text-center" style={{ color: "hsl(0 0% 100% / 0.3)" }}>
              © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
