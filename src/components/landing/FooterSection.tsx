import outReignLogo from "@/assets/outreign-logo.webp";
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
                  src={outReignLogo} 
                  alt="OutReign Logo"
                  className="w-8 h-8 rounded-lg"
                  width={32}
                  height={32}
                />
                <span className="text-lg font-semibold">
                  <span style={{ color: "hsl(0 0% 92%)" }}>Out</span>
                  <span style={{ color: "hsl(261 75% 65%)" }}>Reign</span>
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

          {/* Google API Disclosure */}
          <div id="google-api-disclosure" className="mb-8 p-6 rounded-xl border" style={{ background: "hsl(240 30% 10%)", borderColor: "hsl(261 75% 50% / 0.25)" }}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "hsl(0 0% 92%)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "hsl(261 75% 65%)" }}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
              How OutReign Uses Google User Data
            </h3>
            <div className="text-sm space-y-3" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              <p>
                OutReign requests access to your Gmail data solely to enable outbound email features within the platform. Specifically, we access your Gmail account to:
              </p>
              <ul className="space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                  <span><strong style={{ color: "hsl(0 0% 85%)" }}>Send outbound emails</strong> — messages composed and sent through OutReign on your behalf</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                  <span><strong style={{ color: "hsl(0 0% 85%)" }}>Read reply data</strong> — detect replies to your outreach for tracking and analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                  <span><strong style={{ color: "hsl(0 0% 85%)" }}>Detect open events</strong> — tracking pixels to measure engagement with your sent emails</span>
                </li>
              </ul>
              <p>
                Our use of Google user data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "hsl(261 75% 65%)" }}>Google API Services User Data Policy</a>, including the <strong style={{ color: "hsl(0 0% 85%)" }}>Limited Use</strong> requirements. We do not use Gmail data for advertising, we do not sell it to third parties, we do not use it to train AI models outside your account, and no human reads your messages.
              </p>
              <p>
                You can revoke OutReign's access to your Gmail data at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "hsl(261 75% 65%)" }}>Google Account permissions</a> or by disconnecting the integration in your OutReign settings.
              </p>
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
              <a href="https://nicklaunches.com/products/salesos/?utm_source=outreign.io&utm_medium=badge&utm_campaign=featured" target="_blank" rel="noopener">
                <img src="https://nicklaunches.com/badges/featured-dark.svg" alt="OutReign on Nick Launches" className="h-10 w-auto" width={244} height={56} loading="lazy" />
              </a>
              <a href="https://plugyourbuild.com/listing/outreign-b8ad99" rel="dofollow">
                <img src="https://plugyourbuild.com/api/badge/outreign-b8ad99?style=dark" alt="Listed on Plug Your Build" className="h-10 w-auto" width={180} height={40} loading="lazy" />
              </a>
              <a href="https://rankinpublic.xyz/products/outreign.io" target="_blank" rel="noopener noreferrer">
                <img src="https://rankinpublic.xyz/api/badges/badge-featured.png?site=outreign.io" alt="Featured on RankInPublic" title="Featured on RankInPublic" className="h-10 w-auto" width={125} height={40} loading="lazy" />
              </a>
              <a href="https://www.producthunt.com/products/outreign-io?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-outreign-io" target="_blank" rel="noopener noreferrer">
                <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1174023&theme=dark&t=1781681273997" alt="OutReign.io - Find who to sell to then close them. | Product Hunt" className="h-10 w-auto" width={250} height={54} loading="lazy" />
              </a>
            </div>
            <p className="text-sm text-center" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
              © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
